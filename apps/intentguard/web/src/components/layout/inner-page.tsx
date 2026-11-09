import { PageHeader } from "@/components/layout/page-header";
import { MotionReveal } from "@/components/motion/motion-reveal";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

/** Pulse-style inner layout: left-weighted column, wide cards. */
export function InnerPage({ title, subtitle, children }: Props) {
  return (
    <div className="inner-page-bg">
      <section className="flex flex-col justify-center min-h-screen pt-28 pb-16 px-[5%] md:pl-[20%] md:pr-[10%]">
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
