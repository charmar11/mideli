import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rincón 404 Food Park",
    short_name: "Rincón 404",
    description: "Operación de restaurantes para el equipo de Rincón 404 Food Park.",
    id: "/dashboard",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "any",
    background_color: "#111014",
    theme_color: "#111014",
    shortcuts: [
      {
        name: "Nuevo pedido",
        short_name: "Pedido",
        url: "/dashboard/mesero",
        icons: [{ src: "/icons/rincon-404-192.png", sizes: "192x192" }],
      },
      {
        name: "Pedidos listos",
        short_name: "Estado",
        url: "/dashboard/mesero?mode=status",
        icons: [{ src: "/icons/rincon-404-192.png", sizes: "192x192" }],
      },
    ],
    icons: [
      {
        src: "/icons/rincon-404-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/rincon-404-384.png",
        sizes: "384x384",
        type: "image/png",
      },
      {
        src: "/icons/rincon-404-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/rincon-404-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
