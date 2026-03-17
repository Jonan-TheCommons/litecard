import AdminDashboard from "../components/admin-dashboard.js";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-panel">
        <p className="eyebrow">Litecard Operations</p>
        <h1>Issue digital wallet passes without touching the CSV pipeline.</h1>
      </section>
      <AdminDashboard />
    </main>
  );
}
