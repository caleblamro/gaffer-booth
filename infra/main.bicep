targetScope = 'subscription'

@minLength(1)
@maxLength(40)
@description('Environment name, used to name resources.')
param environmentName string

@minLength(1)
@description('Azure region for all resources.')
param location string

@description('on: deploy a Foundry project + model for the crew (pay per token). off: free tier, the crew uses OpenRouter.')
@allowed(['on', 'off'])
param foundry string = 'off'

@secure()
@description('OpenRouter key for the free-tier crew (used when foundry is off). Empty runs the template tier.')
param openRouterApiKey string = ''

@description('Model deployed to the Foundry project for the crew.')
param modelName string = 'gpt-4.1-mini'
param modelVersion string = '2025-04-14'
param modelCapacity int = 50

var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    tags: tags
    environmentName: environmentName
    modelName: modelName
    modelVersion: modelVersion
    modelCapacity: modelCapacity
    useFoundry: foundry == 'on'
    openRouterApiKey: openRouterApiKey
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryEndpoint
output AZURE_RESOURCE_GROUP string = rg.name
output FOUNDRY_PROJECT_ENDPOINT string = resources.outputs.projectEndpoint
output SERVICE_WEB_URI string = resources.outputs.webUri
