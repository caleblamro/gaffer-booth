param location string
param tags object
param environmentName string
param modelName string
param modelVersion string
param modelCapacity int
param useFoundry bool
@secure()
param openRouterApiKey string

var token = toLower(uniqueString(subscription().id, resourceGroup().id, environmentName))
var aiName = 'ai-${token}'
var projectName = 'gaffer-booth'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${token}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${token}'
  location: location
  tags: tags
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'cr${token}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

// AcrPull for the app identity.
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, 'acrpull')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

// Microsoft Foundry: AI Services account + project + model deployment (only with foundry=on;
// these are billed per token, everything else here fits the free allowances).
resource ai 'Microsoft.CognitiveServices/accounts@2025-06-01' = if (useFoundry) {
  name: aiName
  location: location
  tags: tags
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: aiName
    allowProjectManagement: true
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = if (useFoundry) {
  parent: ai
  name: projectName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    displayName: 'Gaffer Booth'
    description: 'AI broadcast crew for synthetic football matches'
  }
}

resource model 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = if (useFoundry) {
  parent: ai
  name: modelName
  sku: {
    name: 'GlobalStandard'
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
  }
}

// Azure AI User on the Foundry account for the app identity (keyless auth).
resource aiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (useFoundry) {
  scope: ai
  name: guid(ai.id, identity.id, 'azure-ai-user')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '53ca6127-db72-4b80-b1b0-d745d6d5456d')
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${token}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

var projectEndpoint = useFoundry ? 'https://${aiName}.services.ai.azure.com/api/projects/${projectName}' : ''
var crewEnv = useFoundry ? [
  { name: 'FOUNDRY_PROJECT_ENDPOINT', value: projectEndpoint }
  { name: 'FOUNDRY_MODEL', value: modelName }
  { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
] : empty(openRouterApiKey) ? [] : [
  { name: 'OPENROUTER_API_KEY', secretRef: 'openrouter-api-key' }
  // The free model needs longer than the default per-call budget.
  { name: 'BOOTH_LLM_TIMEOUT', value: '15' }
]

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-web-${token}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  dependsOn: [acrPull, aiUser, model]
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
      }
      secrets: useFoundry || empty(openRouterApiKey) ? [] : [
        { name: 'openrouter-api-key', value: openRouterApiKey }
      ]
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: crewEnv
        }
      ]
      // Scale to zero between demos so idle time is free. One replica at most: each
      // broadcast lives in the process that holds its WebSocket.
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '50' } } }]
      }
    }
  }
}

output registryEndpoint string = registry.properties.loginServer
output projectEndpoint string = projectEndpoint
output webUri string = 'https://${web.properties.configuration.ingress.fqdn}'
