const apiUrl = process.env.API_URL || "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/pay/api/:path*",
        destination: `${apiUrl}/pay/api/:path*`
      },
      {
        source: "/admin/api/:path*",
        destination: `${apiUrl}/admin/api/:path*`
      }
    ];
  }
};

export default nextConfig;
