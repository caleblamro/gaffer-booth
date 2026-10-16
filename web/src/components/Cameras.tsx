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
export function Shot({ cam, frame, dir, colors, events, speed, thumb }: ShotProps) {
  if (cam === "radar") return <Pitch frame={frame} events={events} colors={colors} speed={speed} thumb={thumb} />;
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

/** Program header: the Director's state on the left, camera tabs on the right with the program inverted and the preview outlined. */
export function CameraTabs({ dir, multi, setMulti }: TabsProps) {
  return (
    <>
      <span className="ch-l">
        Program
        {dir.auto ? (
          <span className="n auto">Director cuts</span>
        ) : (
          <button type="button" className="mini" onClick={dir.handBack} title="Hand the cameras back to the Director (A)">
            Manual — hand back <kbd>A</kbd>
          </button>
        )}
        {multi && (
          <button type="button" className="mini" onClick={dir.take} title="Take the preview to program (Enter)">
            Take <kbd>Enter</kbd>
          </button>
        )}
      </span>
      <div className="tabs" role="toolbar" aria-label="Cameras">
        {CAMERAS.map((c, i) => {
          const pgm = !multi && c.id === dir.program;
          const pvw = c.id === dir.preview && c.id !== dir.program;
          return (
            <button
              type="button"
              key={c.id}
              className={`${pgm ? "on" : ""}${pvw ? " pvw" : ""}`}
              aria-pressed={pgm}
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
        <button type="button" className={multi ? "on" : ""} onClick={() => setMulti(!multi)} aria-pressed={multi}>
          Multiview
        </button>
      </div>
    </>
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
        <span className="lab hud">
          <kbd>{pgmIdx + 1}</kbd>
          {CAMERAS[pgmIdx].name}
          <em className="pg">
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
            <span className="lab hud">
              <kbd>{CAMERAS.findIndex((x) => x.id === c.id) + 1}</kbd>
              {c.name}
              {pvw && <em className="pv">Preview</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
