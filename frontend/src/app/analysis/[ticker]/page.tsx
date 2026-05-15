import { redirect } from "next/navigation";

export default async function AnalysisRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { ticker } = await params;
  const sp = await searchParams;
  const marketParam = typeof sp.market === "string" ? sp.market : undefined;
  const market = marketParam || (/^\d{6}$/.test(ticker) ? "KOSPI" : "NASDAQ");
  redirect(`/stock/${ticker}?market=${market}&tab=analysis`);
}
