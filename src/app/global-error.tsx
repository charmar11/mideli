"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Mideli global error", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "grid",
          placeItems: "center",
          padding: 24,
          boxSizing: "border-box",
          background: "#111014",
          color: "#fbf8e7",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main
          style={{
            width: "min(100%, 500px)",
            padding: 32,
            border: "1px solid #3a323d",
            borderRadius: 20,
            background: "#211d24",
            boxShadow: "0 18px 48px rgba(0, 0, 0, 0.44)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#f5145f",
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            Mideli
          </p>
          <h1 style={{ margin: "22px 0 0", fontSize: 25 }}>
            El sistema necesita volver a cargar
          </h1>
          <p
            style={{
              margin: "12px auto 0",
              maxWidth: 390,
              color: "#b9aeb1",
              fontSize: 15,
              lineHeight: 1.6,
            }}
          >
            La pantalla principal encontró un problema inesperado. Puedes reintentar o regresar al
            acceso del equipo.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "18px 0 0",
                padding: 12,
                borderRadius: 12,
                background: "#17141a",
                color: "#b9aeb1",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              Referencia: {error.digest}
            </p>
          ) : null}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 10,
              marginTop: 24,
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 48,
                border: 0,
                borderRadius: 12,
                background: "#f5145f",
                color: "#fff",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <a
              href="/login"
              style={{
                minHeight: 48,
                display: "grid",
                placeItems: "center",
                boxSizing: "border-box",
                border: "1px solid #3a323d",
                borderRadius: 12,
                color: "#fbf8e7",
                fontSize: 14,
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Ir al acceso
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
