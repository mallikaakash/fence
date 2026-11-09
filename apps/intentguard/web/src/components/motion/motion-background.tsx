"use client";

/** Fixed ambient layer — sits behind AppShell content (z-index 0). */
export function MotionBackground() {
  return (
    <div className="motion-bg" aria-hidden>
      <div className="motion-bg__orb motion-bg__orb--teal" />
      <div className="motion-bg__orb motion-bg__orb--orange" />
      <div className="motion-bg__orb motion-bg__orb--violet" />
      <div className="motion-bg__grid" />
    </div>
  );
}
