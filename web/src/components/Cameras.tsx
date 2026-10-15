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

/** Program/preview switcher under the picture: red tally on program, white outline on preview. */
export function CameraSwitcher({ frame, dir, colors, events, speed }: SwitcherProps) {
  return (
    <div className="panel cams">
      <div className="cams-h">
        <span className="eyebrow">Cameras</span>
        <span className="auto">
          Cuts
          {dir.auto ? (
            <b>Director · auto</b>
          ) : (
            <button type="button" className="linkish" onClick={dir.handBack}>
              Manual · hand back <span className="kbd">A</span>
            </button>
          )}
        </span>
      </div>
      <div className="thumbs">
        {CAMERAS.map((c, i) => {
          const pgm = c.id === dir.program;
          const pvw = !pgm && c.id === dir.preview;
          return (
            <button type="button" key={c.id} className={`th${pgm ? " pgm" : ""}${pvw ? " pvw" : ""}`} onClick={() => dir.cut(c.id)}>
              <span className="img">
                <Shot cam={c.id} frame={frame} dir={dir} colors={colors} events={events} speed={speed} thumb />
              </span>
              <span className="lb">
                <span className="mono">{i + 1}</span>
                {c.name}
                {pgm && <em className="pg">PGM</em>}
                {pvw && <em className="pv">PVW</em>}
              </span>
            </button>
          );
        })}
      </div>
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
          <span className="mono">{pgmIdx + 1}</span>
          {CAMERAS[pgmIdx].name}
          <small>{dir.auto ? "Director is cutting" : "Manual"}</small>
          <em className="pg">PGM</em>
        </span>
      </button>
      {others.map((c) => {
        const pvw = c.id === dir.preview;
        return (
          <button type="button" key={c.id} className={`tile${pvw ? " pvw" : ""}`} onClick={() => dir.cut(c.id)}>
            <Shot cam={c.id} frame={frame} dir={dir} colors={colors} events={events} speed={speed} thumb />
            <span className="lab">
              <span className="mono">{CAMERAS.findIndex((x) => x.id === c.id) + 1}</span>
              {c.name}
              {pvw && <em className="pv">PVW</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
