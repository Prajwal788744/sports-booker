export default function GcuLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <img
      src="/gcu-logo.png"
      alt="GCU Sports"
      className={`${className} rounded-xl object-cover`}
    />
  );
}
