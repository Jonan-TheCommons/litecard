import "./globals.css";

export const metadata = {
  title: "Litecard Admin",
  description: "Admin dashboard for generating Litecard passes and sending member emails.",
  robots: {
    follow: false,
    index: false,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
