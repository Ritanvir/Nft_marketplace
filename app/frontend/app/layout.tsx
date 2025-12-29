import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Counter dApp",
  description: "Solana + Anchor practice",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
