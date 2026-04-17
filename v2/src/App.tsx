import { Suspense, lazy } from "react";
import { useAppController } from "./app/useAppController";
import { ViewErrorBoundary } from "./components/ViewErrorBoundary";
import { NavigationProvider } from "./contexts/NavigationContext";
import { ProjectProvider } from "./contexts/ProjectContext";
import { IterationProvider } from "./contexts/IterationContext";
import { ChatProvider } from "./contexts/ChatContext";
import { AnalysisProvider } from "./contexts/AnalysisContext";
import { PlatformProvider } from "./contexts/PlatformContext";
import { AuthenticatedWorkspace } from "./app/AuthenticatedWorkspace";

const MarketingHomePage = lazy(() => import("./pages/marketing/MarketingHomePage").then((m) => ({ default: m.MarketingHomePage })));
const LoginPage = lazy(() => import("./pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })));

/**
 * Nests all 7 domain-specific Context providers.
 * Lightweight when the authenticated workspace is not active — the providers
 * simply hold default (empty) state that nothing reads.
 */
function DomainProviders({ children }: { children: React.ReactNode }) {
  return (
    <NavigationProvider>
      <ProjectProvider>
        <IterationProvider>
          <ChatProvider>
            <AnalysisProvider>
                <PlatformProvider>
                  {children}
                </PlatformProvider>
            </AnalysisProvider>
          </ChatProvider>
        </IterationProvider>
      </ProjectProvider>
    </NavigationProvider>
  );
}

/**
 * Inner app shell.  Lives _inside_ DomainProviders so useAppController()
 * (which now consumes the 7 contexts via useWorkspaceState) works correctly.
 */
function AppInner() {
  const controller = useAppController();
  const isMarketingRoute =
    controller.route === "marketing" ||
    (!controller.isAuthenticated && !controller.sessionRestoring && controller.route !== "login");

  if (isMarketingRoute) {
    return <MarketingRoute isAuthenticated={controller.isAuthenticated} />;
  }
  if (controller.sessionRestoring) {
    return <div className="loading-spinner" />;
  }
  if (controller.route === "login" || !controller.isAuthenticated) {
    return <LoginRoute controller={controller} />;
  }
  return <AuthenticatedWorkspace controller={controller} />;
}

function MarketingRoute({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <ViewErrorBoundary viewKey="marketing" viewLabel="营销首页">
      <Suspense fallback={<div className="loading-spinner" />}>
        <MarketingHomePage
          isAuthenticated={isAuthenticated}
          onPrimaryAction={() => {
            window.location.hash = isAuthenticated ? "/dashboard" : "/login";
          }}
          onSecondaryAction={() => {
            window.location.hash = isAuthenticated ? "/dashboard" : "/login";
          }}
        />
      </Suspense>
    </ViewErrorBoundary>
  );
}

function LoginRoute({ controller }: { controller: ReturnType<typeof useAppController> }) {
  return (
    <ViewErrorBoundary viewKey="login" viewLabel="登录页">
      <Suspense fallback={<div className="loading-spinner" />}>
        <LoginPage
          loginMode={controller.loginMode}
          loginPhone={controller.loginPhone}
          loginCode={controller.loginCode}
          showPhoneError={controller.showPhoneError}
          showCodeError={controller.showCodeError}
          phoneError={controller.phoneError}
          codeError={controller.codeError}
          loginError={controller.loginError}
          debugCodeHint={controller.debugCodeHint}
          sendingCode={controller.sendingCode}
          countdown={controller.countdown}
          phoneRef={controller.loginPhoneRef}
          codeRef={controller.loginCodeRef}
          onSubmit={controller.handleLogin}
          onSwitchMode={controller.setLoginMode}
          onRequestCode={controller.handleRequestCode}
          onPhoneChange={controller.setLoginPhone}
          onCodeChange={controller.setLoginCode}
          onPhoneBlur={() => controller.setLoginTouched((prev) => ({ ...prev, phone: true }))}
          onCodeBlur={() => controller.setLoginTouched((prev) => ({ ...prev, code: true }))}
        />
      </Suspense>
    </ViewErrorBoundary>
  );
}

export default function App() {
  return (
    <ViewErrorBoundary viewKey="root" viewLabel="应用">
      <DomainProviders>
        <AppInner />
      </DomainProviders>
    </ViewErrorBoundary>
  );
}
