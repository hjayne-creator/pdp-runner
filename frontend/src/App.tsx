import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { RunnerPage } from './pages/RunnerPage';
import { HistoryListPage, HistoryDetailPage } from './pages/HistoryPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/run" element={<RunnerPage />} />
          <Route path="/history" element={<HistoryListPage />} />
          <Route path="/history/:jobId" element={<HistoryDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
