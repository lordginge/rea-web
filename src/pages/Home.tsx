import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, ScanSearch, Image as ImageIcon, ExternalLink } from "lucide-react";

interface AnalyzeOptions {
  screenshot: boolean;
  consoleText: boolean;
  storageKeys: boolean;
  scriptSources: boolean;
  jsonBodyShapes: boolean;
}

type PageResult = Record<string, any> | null;

interface AnalyzeResult {
  page: PageResult;
  screenshotBase64: string | null;
  evidenceIds: string[];
  url: string;
  analyzedAt: string;
}

const DEFAULT_OPTIONS: AnalyzeOptions = {
  screenshot: true,
  consoleText: true,
  storageKeys: true,
  scriptSources: false,
  jsonBodyShapes: true,
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-mono">{value}</div>
      </CardContent>
    </Card>
  );
}

function ResultView({ result }: { result: AnalyzeResult }) {
  const page = result.page ?? {};
  const scripts = page.scripts?.items ?? [];
  const network = page.network?.requests ?? [];
  const consoleEvents = page.console?.events ?? [];
  const storage = page.storage ?? {};
  const limitations: string[] = page.limitations ?? [];
  const target = page.target ?? {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-mono text-xs">
          {result.url}
        </Badge>
        <Badge variant="outline" className="font-mono text-xs">
          {result.analyzedAt}
        </Badge>
        {result.evidenceIds.map((id) => (
          <Badge key={id} variant="outline" className="font-mono text-xs" title={id}>
            ev:{id.slice(0, 10)}
          </Badge>
        ))}
      </div>

      {result.screenshotBase64 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Captured viewport
            </CardTitle>
          </CardHeader>
          <CardContent>
            <img
              src={`data:image/png;base64,${result.screenshotBase64}`}
              alt={`Screenshot of ${result.url}`}
              className="w-full rounded-md border"
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="DOM nodes" value={page.dom?.total_nodes ?? 0} />
        <StatCard label="Scripts" value={page.scripts?.total ?? 0} />
        <StatCard label="Network requests" value={network.length} />
        <StatCard
          label="Console events"
          value={consoleEvents.length}
        />
      </div>

      {(target.title || target.origin) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">Title: </span>
              {target.title || "(none)"}
            </div>
            <div className="font-mono break-all">
              <span className="text-muted-foreground">URL: </span>
              {target.url}
            </div>
          </CardContent>
        </Card>
      )}

      <Accordion type="multiple" defaultValue={["scripts", "network"]} className="w-full">
        <AccordionItem value="scripts">
          <AccordionTrigger>Scripts ({scripts.length})</AccordionTrigger>
          <AccordionContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>URL / source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scripts.slice(0, 100).map((s: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{i}</TableCell>
                    <TableCell className="font-mono text-xs break-all">
                      {s.url || s.source || JSON.stringify(s).slice(0, 160)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="network">
          <AccordionTrigger>Network requests ({network.length})</AccordionTrigger>
          <AccordionContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Method</TableHead>
                  <TableHead>URL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {network.slice(0, 150).map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.method ?? "?"}</TableCell>
                    <TableCell className="font-mono text-xs break-all">{r.url}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="console">
          <AccordionTrigger>Console events ({consoleEvents.length})</AccordionTrigger>
          <AccordionContent>
            {consoleEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No console events captured.</p>
            ) : (
              <div className="space-y-1">
                {consoleEvents.slice(0, 100).map((e: any, i: number) => (
                  <div key={i} className="font-mono text-xs break-all">
                    [{e.type ?? "log"}] {e.text ?? JSON.stringify(e)}
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="storage">
          <AccordionTrigger>Storage</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground mb-1">localStorage keys</div>
                <div className="font-mono text-xs space-y-0.5">
                  {(storage.local_storage_keys ?? []).map((k: string) => (
                    <div key={k}>{k}</div>
                  ))}
                  {(storage.local_storage_keys ?? []).length === 0 && (
                    <div className="text-muted-foreground">none</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">sessionStorage keys</div>
                <div className="font-mono text-xs space-y-0.5">
                  {(storage.session_storage_keys ?? []).map((k: string) => (
                    <div key={k}>{k}</div>
                  ))}
                  {(storage.session_storage_keys ?? []).length === 0 && (
                    <div className="text-muted-foreground">none</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">IndexedDB</div>
                <div className="font-mono text-xs">
                  {(storage.indexed_db_names ?? []).join(", ") || "none"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Usage</div>
                <div className="font-mono text-xs">
                  {(storage.usage_bytes ?? 0).toLocaleString()} bytes
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="raw">
          <AccordionTrigger>Raw JSON</AccordionTrigger>
          <AccordionContent>
            <pre className="text-xs font-mono overflow-auto max-h-96 rounded-md border p-3 bg-muted/40">
              {JSON.stringify(page, null, 2)}
            </pre>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {limitations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Limitations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<AnalyzeOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = trpc.rea.analyze.useMutation();
  const history = trpc.rea.history.useQuery();
  const getAnalysis = trpc.rea.get.useMutation();

  const setOpt = (key: keyof AnalyzeOptions) => (checked: boolean) =>
    setOptions((o) => ({ ...o, [key]: checked }));

  const canRun = url.trim().length > 3 && !analyze.isPending;

  const run = async () => {
    setError(null);
    setResult(null);
    try {
      const r = await analyze.mutateAsync({ url: url.trim(), options });
      if (r.ok) {
        setResult(r.result as AnalyzeResult);
        history.refetch();
      } else {
        setError(r.error);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The analysis request failed.";
      setError(
        `${message} If the target is slow or heavy, the server may have timed out; try a simpler page.`,
      );
    }
  };

  const loadHistory = async (id: number) => {
    try {
      const data = (await getAnalysis.mutateAsync({ id })) as any;
      if (data?.resultJson) {
        setResult(JSON.parse(data.resultJson));
        setUrl(data.url);
        setError(null);
      } else if (data?.error) {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that analysis.");
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-10 md:py-16">
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-[#5c4ee5] flex items-center justify-center">
              <ScanSearch className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight">REA Web</span>
          </div>
          <a
            href="https://github.com/morluto/rea"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Powered by REA <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </header>

        <section className="mb-12">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Reverse engineer any website
          </h1>
          <p className="text-muted-foreground max-w-2xl mb-8">
            Paste a URL and REA opens it in a real browser, then inspects the
            page through the Chrome DevTools Protocol. You get the page
            structure, scripts, network requests, console output and storage,
            each claim backed by evidence.
          </p>

          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canRun && run()}
              placeholder="https://example.com"
              className="md:flex-1 h-11 font-mono"
              aria-label="Website URL"
            />
            <Button onClick={run} disabled={!canRun} className="h-11 px-6 bg-[#5c4ee5] hover:bg-[#4b3fd1] text-white">
              {analyze.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing
                </>
              ) : (
                "Analyze"
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(
              [
                ["screenshot", "Screenshot"],
                ["consoleText", "Console"],
                ["storageKeys", "Storage keys"],
                ["scriptSources", "Script sources"],
                ["jsonBodyShapes", "WebSocket shapes"],
              ] as Array<[keyof AnalyzeOptions, string]>
            ).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={options[key]}
                  onCheckedChange={(v) => setOpt(key)(v === true)}
                />
                <Label htmlFor={key} className="text-sm text-muted-foreground cursor-pointer">
                  {label}
                </Label>
              </div>
            ))}
          </div>

          {analyze.isPending && (
            <p className="text-sm text-muted-foreground mt-4 animate-pulse">
              Launching browser, loading the page and observing it. This takes
              15 to 60 seconds.
            </p>
          )}
          {error && (
            <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </section>

        {result && <ResultView result={result} />}

        {history.data && history.data.length > 0 && (
          <section className="mt-14">
            <h2 className="text-lg font-semibold tracking-tight mb-4">Recent analyses</h2>
            <div className="space-y-2">
              {history.data.map((h) => (
                <button
                  key={h.id}
                  onClick={() => loadHistory(h.id)}
                  className="w-full text-left flex items-center justify-between gap-4 rounded-md border px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <span className="font-mono text-xs md:text-sm truncate">{h.url}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <Badge variant={h.status === "done" ? "secondary" : "destructive"}>
                      {h.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {h.createdAt.toLocaleString?.() ?? String(h.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-16 text-xs text-muted-foreground">
          Analysis runs locally in a sandboxed headless browser via the REA
          CLI. Only public http(s) targets are accepted. Findings are passive
          observations and may be incomplete.
        </footer>
      </div>
    </div>
  );
}
