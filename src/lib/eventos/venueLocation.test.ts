import { describe, expect, it } from "vitest";
import { parseCoordinates, resolveVenueCoordinates, venueLocationStatus } from "./venueLocation";

const OBELISCO = { lat: -34.6037, lng: -58.3816 };

describe("parseCoordinates", () => {
  describe("coordenadas tipeadas", () => {
    it.each([
      ["-34.6037, -58.3816"],
      ["-34.6037,-58.3816"],
      ["  -34.6037 , -58.3816  "],
      ["-34.6037 -58.3816"],
      ["-34.6037;-58.3816"],
      ["\n-34.6037,\n-58.3816\n"],
    ])("lee %j", (text) => {
      expect(parseCoordinates(text)).toEqual(OBELISCO);
    });

    it("acepta números enteros y positivos", () => {
      expect(parseCoordinates("40, 70")).toEqual({ lat: 40, lng: 70 });
      expect(parseCoordinates("-31.4201, -64.1888")).toEqual({ lat: -31.4201, lng: -64.1888 });
    });

    it("redondea a 6 decimales", () => {
      expect(parseCoordinates("-34.60371234567, -58.38161234567")).toEqual({
        lat: -34.603712,
        lng: -58.381612,
      });
    });
  });

  describe("links largos de Google Maps", () => {
    it("el centro del mapa (@lat,lng)", () => {
      expect(
        parseCoordinates("https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z/data=!3m1!4b1"),
      ).toEqual(OBELISCO);
    });

    it("el punto exacto (!3d…!4d…) gana sobre el centro del mapa", () => {
      const url =
        "https://www.google.com/maps/place/Casa/@-34.5000,-58.4000,17z/data=!3m1!4b1!4m6!3m5!1s0x95:0x1!8m2!3d-34.6037!4d-58.3816!16s";
      expect(parseCoordinates(url)).toEqual(OBELISCO);
    });

    it.each([
      ["https://maps.google.com/?q=-34.6037,-58.3816"],
      ["https://www.google.com/maps?q=-34.6037%2C-58.3816&z=17"],
      ["https://www.google.com/maps?ll=-34.6037,-58.3816&z=17"],
      ["https://www.google.com/maps/dir/?api=1&destination=-34.6037,-58.3816"],
      ["https://www.google.com/maps/search/?api=1&query=-34.6037%2C-58.3816"],
      ["https://www.google.com/maps/place/-34.6037,-58.3816"],
      ["https://www.google.com/maps/place/-34.6037,-58.3816/@-34.6037,-58.3816,17z"],
      ["https://www.google.com/maps/dir/-34.6037,-58.3816/otro"],
      ["https://maps.google.com/maps/api/staticmap?center=-34.6037%2C-58.3816&zoom=15"],
    ])("lee %s", (url) => {
      expect(parseCoordinates(url)).toEqual(OBELISCO);
    });

    it("lee las coordenadas aunque el % del link esté mal formado", () => {
      expect(parseCoordinates("https://maps.google.com/?q=-34.6037%2C-58.3816&x=100%")).toEqual(OBELISCO);
    });
  });

  describe("lo que no tiene coordenadas", () => {
    it.each([
      [""],
      ["   "],
      ["-34.6037"],
      ["Av. Cabildo 2394, CABA"],
      ["Cabildo 2394"],
      ["2394, 1428"],
      ["Tel 11 4444-5555"],
      ["https://maps.app.goo.gl/g45UqHpc6iVv8Ng67"],
      ["https://maps.app.goo.gl/bGqcfqjC8wSDoh2S8?g_st=ac"],
      ["https://www.google.com/maps/place/Casa+de+Fer"],
      ["https://www.google.com/maps/place/Av.+Cabildo+2394,+C1428+CABA"],
    ])("%j → null", (text) => {
      expect(parseCoordinates(text)).toBeNull();
    });

    it.each([
      ["91, 10"],
      ["-91, 10"],
      ["10, 181"],
      ["10, -181"],
      ["0, 0"],
      ["0.0 0.0"],
      ["https://maps.google.com/?q=95,10"],
      ["https://www.google.com/maps/@10,200,17z"],
    ])("fuera de rango o en 0,0: %j → null", (text) => {
      expect(parseCoordinates(text)).toBeNull();
    });
  });
});

type Route = (url: string) => Response | Promise<Response>;

function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`pedido inesperado: ${url}`);
    return route(url);
  }) as typeof fetch;
  return { impl, calls };
}

const redirect = (location: string, status = 302): Route => () =>
  new Response(null, { status, headers: { location } });
const page = (html: string, status = 200): Route => () => new Response(html, { status });

describe("resolveVenueCoordinates", () => {
  it("lee las coordenadas tipeadas sin salir a la red", async () => {
    const { impl, calls } = fakeFetch({});
    expect(await resolveVenueCoordinates("-34.6037, -58.3816", { fetchImpl: impl })).toEqual(OBELISCO);
    expect(calls).toHaveLength(0);
  });

  it("lee un link largo de Google sin salir a la red", async () => {
    const { impl, calls } = fakeFetch({});
    const url = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
    expect(await resolveVenueCoordinates(url, { fetchImpl: impl })).toEqual(OBELISCO);
    expect(calls).toHaveLength(0);
  });

  it("sin dirección o vacía devuelve null", async () => {
    const { impl, calls } = fakeFetch({});
    expect(await resolveVenueCoordinates(null, { fetchImpl: impl })).toBeNull();
    expect(await resolveVenueCoordinates(undefined, { fetchImpl: impl })).toBeNull();
    expect(await resolveVenueCoordinates("   ", { fetchImpl: impl })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("una dirección escrita no se geocodifica", async () => {
    const { impl, calls } = fakeFetch({});
    expect(await resolveVenueCoordinates("Av. Cabildo 2394, CABA", { fetchImpl: impl })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  describe("links cortos de Google", () => {
    it("sigue la redirección y lee las coordenadas del destino", async () => {
      const { impl, calls } = fakeFetch({
        "https://maps.app.goo.gl/abc": redirect(
          "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z/data=!3m1",
        ),
      });
      expect(await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl })).toEqual(OBELISCO);
      expect(calls).toHaveLength(1);
      expect(calls[0].init?.redirect).toBe("manual");
    });

    it("sigue varias redirecciones, también las relativas", async () => {
      const { impl, calls } = fakeFetch({
        "https://maps.app.goo.gl/abc": redirect("https://goo.gl/maps/xyz"),
        "https://goo.gl/maps/xyz": redirect("/maps/place/Casa"),
        "https://goo.gl/maps/place/Casa": redirect("https://www.google.com/maps/place/Casa/@-34.6037,-58.3816,17z"),
      });
      expect(await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl })).toEqual(OBELISCO);
      expect(calls.map((c) => c.url)).toEqual([
        "https://maps.app.goo.gl/abc",
        "https://goo.gl/maps/xyz",
        "https://goo.gl/maps/place/Casa",
      ]);
    });

    it("con un link de los de «Compartir» (con parámetros) también", async () => {
      const { impl } = fakeFetch({
        "https://maps.app.goo.gl/bGqcfqjC8wSDoh2S8?g_st=ac": redirect(
          "https://www.google.com/maps/place/Nico/data=!4m2!3m1!1s0x95:0x2!3d-34.6037!4d-58.3816?entry=tts",
        ),
      });
      expect(
        await resolveVenueCoordinates("https://maps.app.goo.gl/bGqcfqjC8wSDoh2S8?g_st=ac", { fetchImpl: impl }),
      ).toEqual(OBELISCO);
    });

    it("lee las coordenadas de un destino aunque no sea de Google, sin pedirlo (la página de consentimiento)", async () => {
      const { impl, calls } = fakeFetch({
        "https://maps.app.goo.gl/abc": redirect(
          "https://consent.google.com/m?continue=" +
            encodeURIComponent("https://www.google.com/maps/place/Casa/@-34.6037,-58.3816,17z"),
        ),
      });
      expect(await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl })).toEqual(OBELISCO);
      expect(calls).toHaveLength(1);
    });

    it("sin coordenadas en el recorrido ni en la página final: null", async () => {
      const { impl } = fakeFetch({
        "https://maps.app.goo.gl/abc": redirect("https://www.google.com/maps/place/Casa"),
        "https://www.google.com/maps/place/Casa": page("<html>nada que ver</html>"),
      });
      expect(await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl })).toBeNull();
    });

    it("como último recurso lee el centro del mapa de la página final", async () => {
      const { impl } = fakeFetch({
        "https://maps.app.goo.gl/abc": redirect("https://www.google.com/maps/place/Casa"),
        "https://www.google.com/maps/place/Casa": page(
          '<meta content="https://maps.google.com/maps/api/staticmap?center=-34.6037%2C-58.3816&amp;zoom=15&amp;size=900x900">',
        ),
      });
      expect(await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl })).toEqual(OBELISCO);
    });

    it("de la página final solo lee los primeros 200 KB", async () => {
      const { impl } = fakeFetch({
        "https://maps.app.goo.gl/abc": redirect("https://www.google.com/maps/place/Casa"),
        "https://www.google.com/maps/place/Casa": page("x".repeat(250_000) + "@-34.6037,-58.3816,17z"),
      });
      expect(await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl })).toBeNull();
    });

    it("una respuesta con error, sin Location o una excepción de red dan null", async () => {
      const link = "https://maps.app.goo.gl/abc";
      expect(await resolveVenueCoordinates(link, { fetchImpl: fakeFetch({ [link]: page("", 404) }).impl })).toBeNull();
      expect(await resolveVenueCoordinates(link, { fetchImpl: fakeFetch({ [link]: page("", 503) }).impl })).toBeNull();
      expect(
        await resolveVenueCoordinates(link, {
          fetchImpl: fakeFetch({ [link]: () => new Response(null, { status: 302 }) }).impl,
        }),
      ).toBeNull();
      expect(
        await resolveVenueCoordinates(link, {
          fetchImpl: (async () => {
            throw new TypeError("fetch failed");
          }) as typeof fetch,
        }),
      ).toBeNull();
    });

    it("no sigue una redirección infinita: corta a los 5 pedidos", async () => {
      const calls: string[] = [];
      const impl = (async (input: string | URL | Request) => {
        calls.push(String(input));
        return new Response(null, { status: 302, headers: { location: `https://goo.gl/maps/${calls.length}` } });
      }) as typeof fetch;
      expect(await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl })).toBeNull();
      expect(calls).toHaveLength(5);
    });

    it("el tope de saltos se puede cambiar", async () => {
      const calls: string[] = [];
      const impl = (async (input: string | URL | Request) => {
        calls.push(String(input));
        return new Response(null, { status: 302, headers: { location: `https://goo.gl/maps/${calls.length}` } });
      }) as typeof fetch;
      await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl, maxRedirects: 1 });
      expect(calls).toHaveLength(2);
    });

    it("usa un solo tope de tiempo para toda la resolución", async () => {
      const signals: (AbortSignal | null | undefined)[] = [];
      let n = 0;
      const impl = (async (_input: string | URL | Request, init?: RequestInit) => {
        signals.push(init?.signal);
        n += 1;
        return n < 3
          ? new Response(null, { status: 302, headers: { location: `https://goo.gl/maps/${n}` } })
          : new Response("", { status: 200 });
      }) as typeof fetch;
      await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl });
      expect(signals).toHaveLength(3);
      expect(signals[0]).toBeInstanceOf(AbortSignal);
      expect(signals[1]).toBe(signals[0]);
      expect(signals[2]).toBe(signals[0]);
    });

    it("si se acaba el tiempo devuelve null", async () => {
      const impl = ((_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")));
        })) as typeof fetch;
      expect(await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl, timeoutMs: 20 })).toBeNull();
    });
  });

  describe("el servidor solo le pide cosas a Google (SSRF)", () => {
    const sinPedidos = async (address: string) => {
      const { impl, calls } = fakeFetch({});
      const result = await resolveVenueCoordinates(address, { fetchImpl: impl });
      return { result, calls };
    };

    it.each([
      ["http://maps.app.goo.gl/abc"], // sin https
      ["https://evil.test/maps"],
      ["https://maps.app.goo.gl.evil.test/abc"], // el host entero, no «empieza con»
      ["https://evilgoo.gl/abc"],
      ["https://evil.test/?u=maps.app.goo.gl"],
      ["https://maps.app.goo.gl@evil.test/abc"], // el usuario no es el host
      ["https://user:pass@maps.app.goo.gl/abc"],
      ["https://maps.app.goo.gl:8443/abc"],
      ["https://127.0.0.1/maps"],
      ["https://localhost/maps"],
      ["https://169.254.169.254/latest/meta-data"],
      ["file:///etc/passwd"],
      ["ftp://maps.app.goo.gl/abc"],
    ])("no pide %s", async (address) => {
      const { result, calls } = await sinPedidos(address);
      expect(result).toBeNull();
      expect(calls).toHaveLength(0);
    });

    it("no sigue una redirección a un host que no es de Google (ni a la red interna)", async () => {
      for (const destino of [
        "https://evil.test/x",
        "http://www.google.com/maps",
        "http://169.254.169.254/latest/meta-data",
        "https://maps.app.goo.gl.evil.test/x",
        "https://user@www.google.com/x",
        "javascript:alert(1)",
      ]) {
        const { impl, calls } = fakeFetch({ "https://maps.app.goo.gl/abc": redirect(destino) });
        expect(await resolveVenueCoordinates("https://maps.app.goo.gl/abc", { fetchImpl: impl })).toBeNull();
        expect(calls.map((c) => c.url)).toEqual(["https://maps.app.goo.gl/abc"]);
      }
    });

    it("sí pide los hosts de Google de la lista", async () => {
      for (const host of ["www.google.com", "google.com", "maps.google.com", "www.google.com.ar", "maps.google.com.ar", "goo.gl"]) {
        const { impl, calls } = fakeFetch({ [`https://${host}/maps/place/Casa`]: page("<html></html>") });
        expect(await resolveVenueCoordinates(`https://${host}/maps/place/Casa`, { fetchImpl: impl })).toBeNull();
        expect(calls).toHaveLength(1);
      }
    });
  });
});

describe("venueLocationStatus", () => {
  it("con coordenadas: found", () => {
    expect(venueLocationStatus("https://maps.app.goo.gl/abc", OBELISCO)).toBe("found");
    expect(venueLocationStatus(null, OBELISCO)).toBe("found");
  });

  it("con dirección pero sin poder leerla: missing", () => {
    expect(venueLocationStatus("https://maps.app.goo.gl/abc", null)).toBe("missing");
    expect(venueLocationStatus("Av. Cabildo 2394", null)).toBe("missing");
  });

  it("sin dirección: none", () => {
    expect(venueLocationStatus(null, null)).toBe("none");
    expect(venueLocationStatus(undefined, null)).toBe("none");
    expect(venueLocationStatus("   ", null)).toBe("none");
  });
});
