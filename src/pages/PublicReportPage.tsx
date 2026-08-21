import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import * as api from "../lib/api";

interface ReportData {
  student_name: string;
  period_start: string;
  period_end: string;
  summary_text: string | null;
  chart_data: { topicStats?: { type_name: string; accuracyPercent: number }[] } | null;
  generated_at: string;
}

export function PublicReportPage() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .getPublicReportByToken(token)
      .then((data) => {
        if (!data) setNotFound(true);
        else setReport(data as ReportData);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="page-loading">Đang tải báo cáo...</div>;
  if (notFound || !report)
    return <div className="page-loading">Không tìm thấy báo cáo này.</div>;

  return (
    <div className="report-page">
      <h1>Báo cáo học tập</h1>
      <h2>{report.student_name}</h2>
      <p className="report-period">
        Giai đoạn: {report.period_start} — {report.period_end}
      </p>

      {report.summary_text && (
        <div className="report-summary">{report.summary_text}</div>
      )}

      {report.chart_data?.topicStats && report.chart_data.topicStats.length > 0 && (
        <div className="report-chart">
          <h3>Tỉ lệ đúng theo dạng bài</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, report.chart_data.topicStats.length * 40)}>
            <BarChart
              data={report.chart_data.topicStats}
              layout="vertical"
              margin={{ left: 40, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="type_name" width={160} />
              <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
              <Bar dataKey="accuracyPercent" fill="#9c1420" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
