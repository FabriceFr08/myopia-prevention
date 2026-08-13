import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { getReportAggregates } from "../database/database";

export async function generateAndShareReport(daysBack: number = 30) {
  const data = getReportAggregates(daysBack);

  if (!data) {
    throw new Error("Aucune donnée disponible pour cette période.");
  }

  const rowsHtml = data.dailySummaries
    .map(
      (s: any) => `
      <tr>
        <td>${s.date}</td>
        <td>${s.avg_distance_cm != null ? Math.round(s.avg_distance_cm) + " cm" : "—"}</td>
        <td>${s.pct_time_below_25cm != null ? Math.round(s.pct_time_below_25cm) + " %" : "—"}</td>
        <td>${s.total_screen_time_seconds != null ? Math.round(s.total_screen_time_seconds / 60) + " min" : "—"}</td>
      </tr>`,
    )
    .join("");

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, sans-serif; padding: 24px; color: #1E293B; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .subtitle { color: #64748B; font-size: 13px; margin-bottom: 24px; }
          .summary-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
          .card { background: #F1F5F9; border-radius: 8px; padding: 12px 16px; min-width: 140px; }
          .card-label { font-size: 11px; color: #64748B; }
          .card-value { font-size: 20px; font-weight: 600; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E2E8F0; }
          th { color: #64748B; font-weight: 500; }
        </style>
      </head>
      <body>
        <h1>Rapport de suivi visuel</h1>
        <p class="subtitle">Période : ${daysBack} derniers jours — généré le ${new Date().toLocaleDateString("fr-FR")}</p>

        <div class="summary-grid">
          <div class="card">
            <div class="card-label">Distance moyenne</div>
            <div class="card-value">${data.avgDistanceCm != null ? Math.round(data.avgDistanceCm) + " cm" : "—"}</div>
          </div>
          <div class="card">
            <div class="card-label">% temps &lt; 25 cm</div>
            <div class="card-value">${data.avgPctBelow25 != null ? Math.round(data.avgPctBelow25) + " %" : "—"}</div>
          </div>
          <div class="card">
            <div class="card-label">Temps d'écran total</div>
            <div class="card-value">${Math.round(data.totalScreenTimeHours)} h</div>
          </div>
          <div class="card">
            <div class="card-label">Sessions nocturnes</div>
            <div class="card-value">${data.totalNocturnalSessions}</div>
          </div>
          <div class="card">
            <div class="card-label">Adhérence pauses</div>
            <div class="card-value">${data.avgPauseAdherence != null ? Math.round(data.avgPauseAdherence) + " %" : "—"}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Date</th><th>Distance moy.</th><th>% &lt; 25cm</th><th>Temps d'écran</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <p style="margin-top: 24px; font-size: 10px; color: #94A3B8;">
          Ce rapport est généré à partir de mesures estimées par la caméra frontale du téléphone
          et constitue une aide au suivi, non un diagnostic médical.
        </p>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri);
  }

  return uri;
}
