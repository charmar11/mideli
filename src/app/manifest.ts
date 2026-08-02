import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mideli, Burger & Sushi",
    short_name: "Mideli",
    description: "Pedidos, cocina, cobro e inventario conectados para Mideli.",
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
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Pedidos listos",
        short_name: "Estado",
        url: "/dashboard/mesero?mode=status",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
    ],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-384x384.png",
        sizes: "384x384",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
