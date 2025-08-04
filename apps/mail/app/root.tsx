import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
  type MetaFunction,
} from 'react-router';
import { Analytics as DubAnalytics } from '@dub/analytics/react';
import { ServerProviders } from '@/providers/server-providers';
import { ClientProviders } from '@/providers/client-providers';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useEffect, type PropsWithChildren } from 'react';
import type { AppRouter } from '@zero/server/trpc';
import { Button } from '@/components/ui/button';
import { getLocale } from '@/paraglide/runtime';
import { siteConfig } from '@/lib/site-config';
import { signOut } from '@/lib/auth-client';
import type { Route } from './+types/root';
import { AlertCircle } from 'lucide-react';
import { m } from '@/paraglide/messages';
import { ArrowLeft } from 'lucide-react';
import * as Sentry from '@sentry/react';
import superjson from 'superjson';
import './globals.css';

const getUrl = () => import.meta.env.VITE_PUBLIC_BACKEND_URL + '/api/trpc';

export const getServerTrpc = (req: Request) =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        maxItems: 1,
        url: getUrl(),
        transformer: superjson,
        headers: req.headers,
      }),
    ],
  });

export const meta: MetaFunction = () => {
  return [
    { title: siteConfig.title },
    { name: 'description', content: siteConfig.description },
    { property: 'og:title', content: siteConfig.title },
    { property: 'og:description', content: siteConfig.description },
    { property: 'og:image', content: siteConfig.openGraph.images[0].url },
    { property: 'og:url', content: siteConfig.alternates.canonical },
    { property: 'og:type', content: 'website' },
    { rel: 'manifest', href: '/manifest.webmanifest' },
  ];
};

export function Layout({ children }: PropsWithChildren) {
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#141414" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <link rel="manifest" href="/manifest.json" />
        <Meta />
        {import.meta.env.REACT_SCAN && (
          <script crossOrigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js" />
        )}
        <Links />
      </head>
      <body className="antialiased">
        <ServerProviders connectionId={null}>
          <ClientProviders>{children}</ClientProviders>
          <DubAnalytics
            domainsConfig={{
              refer: 'mail0.com',
            }}
          />
        </ServerProviders>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// export function HydrateFallback() {
//   return (
//     <div className="flex h-screen w-full items-center justify-center">
//       <Loader2 className="h-10 w-10 animate-spin" />
//     </div>
//   );
// }

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404 ? 'The requested page could not be found.' : error.statusText || details;
    if (error.status === 404) {
      return <NotFound />;
    }
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  useEffect(() => {
    console.error(error);
    console.error({ message, details, stack });

    // Report error to Sentry
    if (isRouteErrorResponse(error)) {
      Sentry.captureException(new Error(`Route Error ${error.status}: ${error.statusText}`), {
        tags: {
          type: 'route_error',
          status: error.status,
        },
        extra: {
          statusText: error.statusText,
          data: error.data,
        },
      });
    } else if (error instanceof Error) {
      Sentry.captureException(error, {
        tags: {
          type: 'app_error',
        },
      });
    } else {
      Sentry.captureException(new Error('Unknown error occurred'), {
        tags: {
          type: 'unknown_error',
        },
        extra: {
          error: error,
        },
      });
    }
  }, [error, message, details, stack]);

  return (
    <div className="dark:bg-background flex w-full items-center justify-center bg-white text-center">
      <div className="flex-col items-center justify-center md:flex dark:text-gray-100">
        {/* Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Something went wrong!</h2>
          <p className="text-muted-foreground">See the console for more information.</p>
          <pre className="text-muted-foreground">{JSON.stringify(error, null, 2)}</pre>
        </div>

        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="text-muted-foreground gap-2"
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              window.location.href = '/login';
            }}
            className="text-muted-foreground gap-2"
          >
            Log Out and Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black text-center px-4">
      <div className="hero-grid-border w-full max-w-[1200px] flex flex-col items-center justify-center min-h-[600px] py-16">
        {/* All four corner plus signs */}
        <div className="corner-plus -top-[14.8px] -left-[14.6px]">+</div>
        <div className="corner-plus -top-[14.8px] -right-[14.2px]">+</div>
        <div className="corner-plus -bottom-[13.8px] -left-[14.5px]">+</div>
        <div className="corner-plus -bottom-[13.8px] -right-[14.5px]">+</div>

        {/* Logo */}
        <div className="mb-8">
          <img 
            src="/white-icon.svg" 
            alt="Zero Logo" 
            className="h-20 w-20 mx-auto"
          />
        </div>

        {/* 404 Message */}
        <div className="mb-8 text-center space-y-2">
          <h1 className="text-3xl font-medium text-white ">404: Page not found</h1>
          <p className="text-white/60 text-sm">This page does not exist.</p>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 text-white text-sm hover:bg-white/5 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
