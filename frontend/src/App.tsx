import { Navigate, Route, Routes } from 'react-router-dom'
import { StudioLayout } from './layout/StudioLayout'
import { recommendedRoute } from './lib/format'
import { StudioProvider } from './lib/studio'
import { useStudio } from './lib/studio-context'
import { MaterialsPage } from './pages/MaterialsPage'
import { MaterialsLibraryPage } from './pages/MaterialsLibraryPage'
import { AutoExperimentPage } from './pages/AutoExperimentPage'
import { OverviewPage } from './pages/OverviewPage'
import { PreviewFeedbackPage } from './pages/PreviewFeedbackPage'
import { PreviewRunPage } from './pages/PreviewRunPage'
import { PublishPage } from './pages/PublishPage'
import { PublishExportsPage } from './pages/PublishExportsPage'
import { StartPage } from './pages/StartPage'
import { TrainingPage } from './pages/TrainingPage'
import { TrainingClaimsPage } from './pages/TrainingClaimsPage'
import { TrainingProfilePage } from './pages/TrainingProfilePage'

function App() {
  return (
    <StudioProvider>
      <Routes>
        <Route path="/" element={<StudioLayout />}>
          <Route index element={<DefaultEntryPage />} />
          <Route path="start" element={<StartPage />} />
          <Route path="materials">
            <Route index element={<MaterialsPage />} />
            <Route path="library" element={<MaterialsLibraryPage />} />
          </Route>
          <Route path="summary">
            <Route index element={<OverviewPage />} />
            <Route path="current" element={<Navigate to="/summary" replace />} />
            <Route path="uncertainty" element={<Navigate to="/correction/signals" replace />} />
          </Route>
          <Route path="correction">
            <Route index element={<Navigate to="/correction/profile" replace />} />
            <Route path="signals" element={<TrainingPage />} />
            <Route path="profile" element={<TrainingProfilePage />} />
            <Route path="claims" element={<TrainingClaimsPage />} />
          </Route>
          <Route path="validation">
            <Route index element={<Navigate to="/validation/manual" replace />} />
            <Route path="manual" element={<PreviewRunPage />} />
            <Route path="experiments" element={<Navigate to="/experiments" replace />} />
            <Route path="leaderboard" element={<Navigate to="/experiments/results" replace />} />
            <Route path="patches" element={<Navigate to="/experiments/patches" replace />} />
            <Route path="run" element={<Navigate to="/validation/manual" replace />} />
            <Route path="feedback" element={<PreviewFeedbackPage />} />
          </Route>
          <Route path="experiments">
            <Route index element={<AutoExperimentPage />} />
            <Route path="patches" element={<AutoExperimentPage />} />
            <Route path="results" element={<AutoExperimentPage />} />
          </Route>
          <Route path="release">
            <Route index element={<PublishPage />} />
            <Route path="exports" element={<PublishExportsPage />} />
          </Route>
          <Route path="overview" element={<Navigate to="/summary" replace />} />
          <Route path="understanding">
            <Route index element={<Navigate to="/summary" replace />} />
            <Route path="uncertainty" element={<Navigate to="/correction/signals" replace />} />
          </Route>
          <Route path="training">
            <Route index element={<Navigate to="/correction/profile" replace />} />
            <Route path="understanding" element={<Navigate to="/summary" replace />} />
            <Route path="profile" element={<Navigate to="/correction/profile" replace />} />
            <Route path="claims" element={<Navigate to="/correction/claims" replace />} />
            <Route path="uncertainty" element={<Navigate to="/correction/signals" replace />} />
          </Route>
          <Route path="preview">
            <Route index element={<Navigate to="/validation/manual" replace />} />
            <Route path="leaderboard" element={<Navigate to="/experiments/results" replace />} />
            <Route path="patches" element={<Navigate to="/experiments/patches" replace />} />
            <Route path="run" element={<Navigate to="/validation/manual" replace />} />
            <Route path="feedback" element={<Navigate to="/validation/feedback" replace />} />
          </Route>
          <Route path="publish">
            <Route index element={<Navigate to="/release" replace />} />
            <Route path="exports" element={<Navigate to="/release/exports" replace />} />
          </Route>
        </Route>
      </Routes>
    </StudioProvider>
  )
}

function DefaultEntryPage() {
  const { activeProject, hasHydratedProjects } = useStudio()

  if (!hasHydratedProjects) {
    return (
      <div className="default-entry-loading">
        <span className="studio-loading-spinner studio-loading-spinner-lg" aria-hidden />
        <p className="muted">正在加载项目…</p>
      </div>
    )
  }

  return <Navigate to={recommendedRoute(activeProject)} replace />
}

export default App
