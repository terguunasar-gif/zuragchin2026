import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { I18nProvider } from './lib/i18n';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import RouteSeo from './components/RouteSeo';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CreateAlbumPage = lazy(() => import('./pages/albums/CreateAlbumPage'));
const AlbumEditPage = lazy(() => import('./pages/albums/AlbumEditPage'));
const AlbumsPage = lazy(() => import('./pages/albums/AlbumsPage'));
const PhotoUploadPage = lazy(() => import('./pages/photographer/PhotoUploadPage'));
const AlbumPhotosPage = lazy(() => import('./pages/photographer/AlbumPhotosPage'));
const PublicAlbumPage = lazy(() => import('./pages/PublicAlbumPage'));
const AlbumScreenPage = lazy(() => import('./pages/AlbumScreenPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const EventListingsPage = lazy(() => import('./pages/EventListingsPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const PhotographersPage = lazy(() => import('./pages/PhotographersPage'));
const PhotographerDetailPage = lazy(() => import('./pages/PhotographerDetailPage'));
const BoothPage = lazy(() => import('./pages/booth/BoothPage'));
const MyPurchasesPage = lazy(() => import('./pages/MyPurchasesPage'));
const BoothResultPage = lazy(() => import('./pages/booth/BoothResultPage'));
const AiBoothSettingsPage = lazy(() => import('./pages/booth/AiBoothSettingsPage'));
const OrganizerRequestsPage = lazy(() => import('./pages/organizer/OrganizerRequestsPage'));
const AlbumActivatePage = lazy(() => import('./pages/albums/AlbumActivatePage'));
const PrintRequestsPage = lazy(() => import('./pages/organizer/PrintRequestsPage'));
const AlbumListingPage = lazy(() => import('./pages/albums/AlbumListingPage'));
const ExploreAlbumsPage = lazy(() => import('./pages/ExploreAlbumsPage'));
const WalletPage = lazy(() => import('./pages/wallet/WalletPage'));
const OfferPage = lazy(() => import('./pages/OfferPage'));
const AiBoothGalleryPage = lazy(() => import('./pages/AiBoothGalleryPage'));
const PriceOffersPage = lazy(() => import('./pages/photographer/PriceOffersPage'));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const ContactPage = lazy(() => import('./pages/legal/ContactPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const StudiosPage = lazy(() => import('./pages/StudiosPage'));
const StudioDetailPage = lazy(() => import('./pages/StudioDetailPage'));
const StudioFormPage = lazy(() => import('./pages/StudioFormPage'));
const MyStudiosPage = lazy(() => import('./pages/MyStudiosPage'));

function PageFallback() {
  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/20 border-t-amber-500 rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <I18nProvider>
        <RouteSeo />
        <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/dashboard"
            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/print-requests"
            element={<ProtectedRoute><PrintRequestsPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/offers"
            element={<ProtectedRoute><PriceOffersPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/requests"
            element={<ProtectedRoute><OrganizerRequestsPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/albums/create"
            element={<ProtectedRoute><CreateAlbumPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/albums/:albumId"
            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/albums/:albumId/edit"
            element={<ProtectedRoute><AlbumEditPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/albums/:albumId/upload"
            element={<ProtectedRoute><PhotoUploadPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/wallet"
            element={<ProtectedRoute><WalletPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/albums/:albumId/listing"
            element={<ProtectedRoute><AlbumListingPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/albums/:albumId/activate"
            element={<ProtectedRoute><AlbumActivatePage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/albums/:albumId/photos"
            element={<ProtectedRoute><AlbumPhotosPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard/albums/:albumId/ai-booth"
            element={<ProtectedRoute><AiBoothSettingsPage /></ProtectedRoute>}
          />
          <Route
            path="/albums"
            element={<ProtectedRoute><AlbumsPage /></ProtectedRoute>}
          />
          <Route
            path="/admin"
            element={<AdminRoute><AdminDashboard /></AdminRoute>}
          />
          <Route path="/listings" element={<EventListingsPage />} />
          <Route path="/explore" element={<ExploreAlbumsPage />} />
          <Route path="/photographers" element={<PhotographersPage />} />
          <Route path="/photographers/:id" element={<PhotographerDetailPage />} />
          <Route path="/studios" element={<StudiosPage />} />
          <Route path="/studios/new" element={<ProtectedRoute><StudioFormPage /></ProtectedRoute>} />
          <Route path="/studios/mine" element={<ProtectedRoute><MyStudiosPage /></ProtectedRoute>} />
          <Route path="/studios/:slug/edit" element={<ProtectedRoute><StudioFormPage /></ProtectedRoute>} />
          <Route path="/studios/:slug" element={<StudioDetailPage />} />
          <Route path="/album/:shareLink" element={<PublicAlbumPage />} />
          <Route path="/album/:shareLink/screen" element={<AlbumScreenPage />} />
          <Route path="/receipt/:invoiceId" element={<ReceiptPage />} />
          <Route path="/offer/:token" element={<OfferPage />} />
          <Route path="/ai-booth" element={<AiBoothGalleryPage />} />
          <Route path="/my-purchases" element={<MyPurchasesPage />} />
          <Route path="/booth/r/:resultToken" element={<BoothResultPage />} />
          <Route path="/booth/:token" element={<BoothPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
