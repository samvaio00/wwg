import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 py-2 px-6">
      <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-sm text-muted-foreground">
        <Link href="/about" className="hover:text-foreground transition-colors" data-testid="link-about">
          About Us
        </Link>
        <Link href="/return-policy" className="hover:text-foreground transition-colors" data-testid="link-return-policy">
          Return Policy
        </Link>
        <Link href="/disclaimer" className="hover:text-foreground transition-colors" data-testid="link-disclaimer">
          Disclaimer
        </Link>
        <span className="text-muted-foreground/60">
          © {new Date().getFullYear()} Warner Wireless Gears
        </span>
      </div>
    </footer>
  );
}
