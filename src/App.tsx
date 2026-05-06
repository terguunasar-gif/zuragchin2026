import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import CreateAlbumPage from './pages/albums/CreateAlbumPage';
import AlbumsPage from './pages/albums/AlbumsPage';
import PhotoUploadPage from './pages/photographer/PhotoUploadPage';
import AlbumPhotosPage from './pages/photographer/AlbumPhotosPage';
import PublicAlbumPage from './pages/PublicAlbumPage';
import ReceiptPage from './pages/ReceiptPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import EventListingsPage from './pages/EventListingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/auth/login" replace />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/albums/create"
            element={
              <ProtectedRoute>
                <CreateAlbumPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/albums/:albumId"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/albums/:albumId/upload"
            element={
              <ProtectedRoute>
                <PhotoUploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/albums/:albumId/photos"
            element={
              <ProtectedRoute>
                <AlbumPhotosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/albums"
            element={
              <ProtectedRoute>
                <AlbumsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
          {/* Public routes — no login required */}
          <Route path="/listings" element={<EventListingsPage />} />
          <Route path="/album/:shareLink" element={<PublicAlbumPage />} />
          <Route path="/receipt/:invoiceId" element={<ReceiptPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
