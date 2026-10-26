import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_SESSION_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options'

let browserClient: ReturnType<typeof createBrowserClient> | undefined

function canReconnectRealtime() {
  return (
    typeof window !== 'undefined' &&
    window.navigator.onLine &&
    document.visibilityState === 'visible'
  )
}

export function createClient() {
  if (!browserClient) {
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: SUPABASE_SESSION_COOKIE_OPTIONS,
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
        realtime: {
          worker: true,
          heartbeatCallback(status) {
            if (
              (status === 'disconnected' || status === 'timeout') &&
              canReconnectRealtime()
            ) {
              window.setTimeout(() => client.realtime.connect(), 1_000)
            }
          },
        },
      }
    )

    const reconnectWhenVisible = () => {
      if (canReconnectRealtime()) client.realtime.connect()
    }

    window.addEventListener('online', reconnectWhenVisible)
    document.addEventListener('visibilitychange', reconnectWhenVisible)
    browserClient = client
  }

  return browserClient
}
