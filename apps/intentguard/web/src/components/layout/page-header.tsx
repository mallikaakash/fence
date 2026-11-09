type Props = {
  title: string;
  subtitle?: string;
  accent?: "orange" | "teal";
};

export function PageHeader({ title, subtitle, accent = "orange" }: Props) {
  const chip =
    accent === "orange"
      ? "bg-orange-400 text-black"
      : "bg-[#75bfcf] text-black";
  return (
    <header className="mb-8">
      <h1 className="md:text-5xl text-3xl font-sans font-thin uppercase text-left mb-4 inline-block leading-tight">
        <span className={`${chip} px-2 rounded-md shadow-md`}>{title}</span>
      </h1>
      {subtitle ? (
        <p className="text-white/70 text-sm max-w-2xl leading-relaxed text-left">{subtitle}</p>
      ) : null}
    </header>
  );
}
