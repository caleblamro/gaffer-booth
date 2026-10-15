import { useEffect } from "react";
import { CAMERAS, rigFor, type CameraId } from "../lib/camera";
import type { Frame } from "../lib/positions";
import type { MatchEvent, Side } from "../types";
import type { Direction } from "../useDirector";
import { CameraView } from "./CameraView";
import { Pitch } from "./Pitch";

interface ShotProps {
  cam: CameraId;
  frame: Frame;
  dir: Direction;
  colors: Record<Side, string>;
  events: MatchEvent[];
  speed: number;
  thumb?: boolean;
}

/** One camera's picture of a frame. */
/** The radar is a data view, so it uses the UI side colours on navy rather than the rendered kits. */
const RADAR_KITS: Record<Side, string> = { home: "#8f89ff", away: "#2fd3f0" };

export function Shot({ cam, frame, dir, colors, events, speed, thumb }: ShotProps) {
  if (cam === "radar") return <Pitch frame={frame} events={events} colors={RADAR_KITS} speed={speed} thumb={thumb} />;
  return <CameraView frame={frame} rig={rigFor(cam, frame, dir.attack, dir.focus)} colors={colors} thumb={thumb} />;
}

/** Number keys cut, Enter takes the preview, A hands control back to the Director. */
export function useCameraKeys(dir: Direction, enabled: boolean) {
  const { cut, take, handBack } = dir;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= CAMERAS.length) cut(CAMERAS[n - 1].id);
      else if (e.key === "Enter") take();
      else if (e.key === "a" || e.key === "A") handBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cut, take, handBack, enabled]);
}

interface SwitcherProps {
  frame: Frame;
  dir: Direction;
  colors: Record<Side, string>;
  events: MatchEvent[];
  speed: number;
}

interface TabsProps {
  dir: Direction;
  multi: boolean;
  setMulti: (v: boolean) => void;
}

/** Camera tabs under the picture: the program camera is selected, the preview outlined. */
export function CameraTabs({ dir, multi, setMulti }: TabsProps) {
  return (
    <div className="cams" role="toolbar" aria-label="Cameras">
      {CAMERAS.map((c, i) => {
        const pgm = !multi && c.id === dir.program;
        const pvw = c.id === dir.preview && c.id !== dir.program;
        return (
          <button
            type="button"
            key={c.id}
            className={`cam${pgm ? " on" : ""}${pvw ? " pvw" : ""}`}
            onClick={() => {
              setMulti(false);
              dir.cut(c.id);
            }}
            title={`Cut to ${c.name} (${i + 1})${pvw ? " · preview" : ""}`}
          >
            {c.name}
          </button>
        );
      })}
      <span className="cams-sep" />
      <button type="button" className={`cam${multi ? " on" : ""}`} onClick={() => setMulti(!multi)} aria-pressed={multi}>
        Multiview
      </button>
      <span className="cams-r">
        {multi && (
          <button type="button" className="btn sm" onClick={dir.take}>
            Take preview <kbd>Enter</kbd>
          </button>
        )}
        {dir.auto ? (
          <span className="muted sm">Director cuts automatically</span>
        ) : (
          <button type="button" className="btn sm" onClick={dir.handBack}>
            Manual · hand back <kbd>A</kbd>
          </button>
        )}
      </span>
    </div>
  );
}

/** Every camera at once; the program tile is large and carries the tally. */
export function Multiview({ frame, dir, colors, events, speed }: SwitcherProps) {
  const others = CAMERAS.filter((c) => c.id !== dir.program);
  const pgmIdx = CAMERAS.findIndex((c) => c.id === dir.program);
  return (
    <div className="mv">
      <button type="button" className="tile pgm" onClick={() => dir.cut(dir.program)}>
        <Shot cam={dir.program} frame={frame} dir={dir} colors={colors} events={events} speed={speed} />
        <span className="lab">
          <kbd>{pgmIdx + 1}</kbd>
          {CAMERAS[pgmIdx].name}
          <em className="pill live">
            <i />
            Program
          </em>
        </span>
      </button>
      {others.map((c) => {
        const pvw = c.id === dir.preview;
        return (
          <button type="button" key={c.id} className={`tile${pvw ? " pvw" : ""}`} onClick={() => dir.cut(c.id)}>
            <Shot cam={c.id} frame={frame} dir={dir} colors={colors} events={events} speed={speed} thumb />
            <span className="lab">
              <kbd>{CAMERAS.findIndex((x) => x.id === c.id) + 1}</kbd>
              {c.name}
              {pvw && <em className="pill neutral">Preview</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
