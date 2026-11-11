import { PageHeader } from "@/components/layout/page-header";
import { MotionReveal } from "@/components/motion/motion-reveal";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Shorter vertical layout for wizards (no full-viewport centering). */
  compact?: boolean;
};

/** Pulse-style inner layout: left-weighted column, wide cards. */
export function InnerPage({ title, subtitle, children, compact }: Props) {
  return (
    <div className="inner-page-bg">
      <section
        className={`flex flex-col pt-28 pb-16 px-[5%] md:pl-[20%] md:pr-[10%] ${
          compact ? "justify-start" : "justify-center min-h-screen"
        }`}
      >
        <div className="max-w-5xl space-y-6">
          <MotionReveal>
            <PageHeader title={title} subtitle={subtitle} />
          </MotionReveal>
          <div className="inner-page-body">{children}</div>
        </div>
      </section>
    </div>
  );
}
