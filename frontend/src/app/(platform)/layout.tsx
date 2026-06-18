import { TopNav } from "@/components/TopNav";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f9fc] to-[#eef2f8] dark:from-[#0b1220] dark:to-[#0f172a]">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <TopNav />
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-7 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
