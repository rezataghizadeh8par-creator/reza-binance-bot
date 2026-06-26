import express from "express";
import crypto from "crypto";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_SECRET;

app.get("/", (req, res) => {
  res.json({ ok: true, message: "REZA Binance Bot is running" });
});

app.post("/", async (req, res) => {
  try {
    const data = req.body || {};

    const symbol = String(data.symbol || "BTCUSDT").replace(".P", "");
    const side = String(data.side || data.signal || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
    const type = String(data.type || data.orderType || "MARKET").toUpperCase();
    const quantity = String(data.quantity || data.qty || "0.001");

    const params = new URLSearchParams({
      symbol,
      side,
      type,
      quantity,
      timestamp: Date.now().toString(),
      recvWindow: "5000"
    });

    const signature = crypto
      .createHmac("sha256", API_SECRET)
      .update(params.toString())
      .digest("hex");

    params.append("signature", signature);

    const response = await fetch("https://testnet.binancefuture.com/fapi/v1/order", {
      method: "POST",
      headers: {
        "X-MBX-APIKEY": API_KEY,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    const text = await response.text();
    res.status(response.status).type("application/json").send(text);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`REZA Binance Bot running on port ${port}`);
});
