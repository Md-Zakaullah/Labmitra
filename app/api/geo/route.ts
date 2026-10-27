import { langFromRegion } from "@/lib/languages";

export async function GET(req: Request) {
  const h = req.headers;
  const region = h.get("x-vercel-ip-country-region");
  const city = h.get("x-vercel-ip-city");
  return Response.json({
    city: city ? decodeURIComponent(city) : null,
    region,
    language: langFromRegion(region),
  });
}
