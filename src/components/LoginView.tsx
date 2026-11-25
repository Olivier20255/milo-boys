import React from 'react';
import { ShieldCheck, BookOpenCheck, Wallet, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

export const LoginView: React.FC = () => {
  const { signInWithGoogle, authError } = useAuth();

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-50 dark:bg-[#09111E]">
      {/* Left Institutional Visual Column */}
      <div className="relative hidden lg:flex lg:col-span-7 flex-col justify-between p-10 bg-[#0F2557] text-white overflow-hidden">
        <img
          src="/src/assets/images/milo_campus_banner_1795596069874.jpg"
          alt="Milo Boys School Academic Quadrangle"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#091536] via-[#0F2557]/80 to-[#0F2557]/75" />

        <div className="relative z-10 flex items-center gap-3.5">
          <img
            src="/src/assets/images/milo_boys_crest_1795596068996.jpg"
            alt="Milo Boys School Crest"
            referrerPolicy="no-referrer"
            className="h-12 w-12 rounded-md object-cover bg-white p-0.5"
          />
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">MILO BOYS</h2>
            <p className="text-xs text-blue-200">Integrated School Management Information System</p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <h1 className="text-4xl font-bold tracking-tight leading-tight text-white [text-wrap:balance]">
            Centralized Academic, Financial, and Institutional Operations.
          </h1>
          <p className="text-base text-slate-200 leading-relaxed">
            Built for school administrators, teachers, bursars, students, and guardians with role-enforced access, verified examination workflows, and real-time PostgreSQL persistence.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/15">
            <div className="flex items-start gap-3">
              <BookOpenCheck className="h-5 w-5 text-blue-300 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Examination Governance</p>
                <p className="text-xs text-slate-300">Draft to Verified to Published controls</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Wallet className="h-5 w-5 text-blue-300 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Fee & Receipt Ledgers</p>
                <p className="text-xs text-slate-300">Transactional payments and M-Pesa hooks</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-blue-300 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Student & Staff Records</p>
                <p className="text-xs text-slate-300">Restricted confidential data handling</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-blue-300 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Data Protection Compliant</p>
                <p className="text-xs text-slate-300">Full audit trails & server-side RBAC</p>
              </div>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-300">
          Milo Boys School · Nairobi, Kenya · Authorized Personnel & Guardians Portal
        </p>
      </div>

      {/* Right Sign-In Column */}
      <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
          <div className="flex items-center gap-3">
            <img
              src="/src/assets/images/milo_boys_crest_1795596068996.jpg"
              alt="Milo Boys Crest"
              referrerPolicy="no-referrer"
              className="h-11 w-11 rounded-md object-cover border border-slate-200 dark:border-slate-700"
            />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">MILO BOYS Portal</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Integrated School Management System</p>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Sign in to your account</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Authenticate with your institutional or guardian Google account. Permissions are automatically enforced by your assigned role.
            </p>
          </div>

          {authError && (
            <div className="rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
              {authError}
            </div>
          )}

          <Button onClick={signInWithGoogle} size="lg" className="w-full justify-center">
            Continue with Google Sign-In
          </Button>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Access is logged for institutional compliance under the Kenya Data Protection Act, 2019. Contact the School Administrator if your role needs updating.
          </p>
        </div>
      </div>
    </div>
  );
};
