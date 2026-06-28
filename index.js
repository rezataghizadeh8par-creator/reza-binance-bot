import express from "express";
import crypto from "crypto";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_SECRET;

const BASE_URL = "https://testnet.binancefuture.com";

function sign(params) {
  return crypto
    .createHmac("sha256", API_SECRET)
    .update(params.toString())
    .digest("hex");
}

async function binanceRequest(method, path, paramsObj = {}) {
  const params = new URLSearchParams({
    ...paramsObj,
    timestamp: Date.now().toString(),
    recvWindow: "5000",
  });

  params.append("signature", sign(params));

  const url =
  method === "GET"
    ? `${BASE_URL}${path}?${params.toString()}`
    : `${BASE_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : params.toString(),
  });

  const text = await response.text();
  console.log("BINANCE RESPONSE:", text);

  return {
    status: response.status,
    text,
    data: JSON.parse(text),
  };
}

async function getPosition(symbol) {
  const result = await binanceRequest("GET", "/fapi/v2/positionRisk", {
    symbol,
  });

  const position = result.data?.[0];
  const amt = Number(position?.positionAmt || 0);

  return {
    amount: amt,
    side: amt > 0 ? "BUY" : amt < 0 ? "SELL" : "NONE",
    raw: position,
  };
}

async function sendOrder({ symbol, side, quantity, reduceOnly = false }) {
  const params = {
    symbol,
    side,
    type: "MARKET",
    quantity,
  };

  if (reduceOnly) {
    params.reduceOnly = "true";
  }

  return await binanceRequest("POST", "/fapi/v1/order", params);
}

app.get("/", (req, res) => {
  res.json({ ok: true, message: "REZA Binance Bot is running" });
});

app.post("/", async (req, res) => {
  try {
    const data = req.body || {};
    console.log("WEBHOOK RECEIVED:", JSON.stringify(data));

    const symbol = String(data.symbol || "BTCUSDT").replace(".P", "");
    const side =
      String(data.side || data.signal || "BUY").toUpperCase() === "SELL"
        ? "SELL"
        : "BUY";

    const quantity = String(data.quantity || data.qty || "0.001");

    const position = await getPosition(symbol);
    console.log("CURRENT POSITION:", position);

    if (position.side === side) {
      return res.json({
        ok: true,
        action: "ignored",
        message: "Same direction position already open",
        position,
      });
    }

    if (position.side !== "NONE") {
      const closeSide = position.side === "BUY" ? "SELL" : "BUY";
      const closeQty = Math.abs(position.amount).toString();

      console.log("CLOSING OLD POSITION:", closeSide, closeQty);

      await sendOrder({
        symbol,
        side: closeSide,
        quantity: closeQty,
        reduceOnly: true,
      });
    }

    console.log("OPENING NEW POSITION:", side, quantity);

    const openResult = await sendOrder({
      symbol,
      side,
      quantity,
      reduceOnly: false,
    });

    res.status(openResult.status).json({
      ok: true,
      action: "opened",
      symbol,
      side,
      quantity,
      binance: openResult.data,
    });
  } catch (err) {
    console.error("BOT ERROR:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`REZA Binance Bot running on port ${port}`);
});
