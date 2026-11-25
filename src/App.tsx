import React, { useState } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell, ModuleKey } from './components/AppShell';
import { LoginView } from './components/LoginView';
import { DashboardModule } from './modules/DashboardModule';
import { StudentsModule } from './modules/StudentsModule';
import { StaffModule } from './modules/StaffModule';
import { AcademicsModule } from './modules/AcademicsModule';
import { ExaminationsModule } from './modules/ExaminationsModule';
import { FinanceModule } from './modules/FinanceModule';
import { AttendanceModule } from './modules/AttendanceModule';
import { TimetableModule } from './modules/TimetableModule';
import { CommunicationModule } from './modules/CommunicationModule';
import { ReportsModule } from './modules/ReportsModule';
import { AdministrationModule } from './modules/AdministrationModule';

const MainWorkspace: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#09111E]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-[#0F2557] border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Initializing MILO BOYS Portal...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <DashboardModule onNavigate={setActiveModule} />;
      case 'students':
        return <StudentsModule />;
      case 'staff':
        return <StaffModule />;
      case 'academics':
        return <AcademicsModule />;
      case 'examinations':
        return <ExaminationsModule />;
      case 'finance':
        return <FinanceModule />;
      case 'attendance':
        return <AttendanceModule />;
      case 'timetable':
        return <TimetableModule />;
      case 'communication':
        return <CommunicationModule />;
      case 'reports':
        return <ReportsModule />;
      case 'administration':
        return <AdministrationModule />;
      default:
        return <DashboardModule onNavigate={setActiveModule} />;
    }
  };

  return (
    <AppShell activeModule={activeModule} onSelectModule={setActiveModule}>
      {renderModule()}
    </AppShell>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" richColors />
      <MainWorkspace />
    </AuthProvider>
  );
}
