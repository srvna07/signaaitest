import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout/Layout';
import { Login } from './pages/Login/Login';
import { ProjectList } from './pages/Projects/ProjectList';
import { TestCases } from './pages/TestCases/TestCases';
import { TestCaseDetail } from './pages/TestCases/TestCaseDetail';
import { TestCaseNew } from './pages/TestCases/TestCaseNew';
import { Requirements } from './pages/Requirements/Requirements';
import { RequirementDetail } from './pages/Requirements/RequirementDetail';
import { Environments } from './pages/Environments/Environments';
import { EnvironmentDetail } from './pages/Environments/EnvironmentDetail';
import { Role } from './types';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ProjectList />} />
            <Route path="/projects/:projectId" element={<Layout />}>
              <Route index element={<Navigate to="test-cases" replace />} />
              
              <Route path="test-cases" element={<TestCases />} />
              <Route element={<ProtectedRoute allowedRoles={[Role.ADMIN, Role.EDITOR]} />}>
                <Route path="test-cases/new" element={<TestCaseNew />} />
              </Route>
              <Route path="test-cases/:id" element={<TestCaseDetail />} />

              <Route path="requirements" element={<Requirements />} />
              <Route path="requirements/:id" element={<RequirementDetail />} />
              
              <Route path="environments" element={<Environments />} />
              <Route path="environments/:id" element={<EnvironmentDetail />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
