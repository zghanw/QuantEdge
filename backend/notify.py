"""Push notifications (Telegram / Discord webhooks — both free, BYOK).

Inspired by ZhuLinsen/daily_stock_analysis (MIT). Configure any of:
  TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
  DISCORD_WEBHOOK_URL
With nothing configured every function is a no-op.
"""
import json
import os
import time
import urllib.request

from dotenv import load_dotenv

load_dotenv()
_TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
_TG_CHAT = os.getenv("TELEGRAM_CHAT_ID")
_DISCORD = os.getenv("DISCORD_WEBHOOK_URL")
COOLDOWN_SECONDS = int(os.getenv("NOTIFY_COOLDOWN_SECONDS", "900"))

_last_signal: dict = {}  # ticker -> last seen signal
_last_sent: dict = {}    # ticker -> wall clock of last notification


def configured() -> bool:
    return bool((_TG_TOKEN and _TG_CHAT) or _DISCORD)


def _post(url: str, payload: dict):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=10).read()


def send_text(text: str) -> bool:
    """Send to every configured channel; returns True if at least one succeeded."""
    sent = False
    if _TG_TOKEN and _TG_CHAT:
        try:
            _post(f"https://api.telegram.org/bot{_TG_TOKEN}/sendMessage",
                  {"chat_id": _TG_CHAT, "text": text})
            sent = True
        except Exception as e:
            print(f"Telegram notify failed: {e}")
    if _DISCORD:
        try:
            _post(_DISCORD, {"content": text[:1900]})  # Discord caps content at 2000 chars
            sent = True
        except Exception as e:
            print(f"Discord notify failed: {e}")
    return sent


def maybe_notify_signal_change(ticker: str, signal, price=None, regime_verdict: str = "Unknown"):
    """Fire when a ticker's signal changes. The first sighting is a silent baseline;
    a per-ticker cooldown stops flapping signals from spamming the channel
    (changes during the cooldown are dropped, not queued — by design)."""
    if not configured() or not signal or signal in ("Waiting for data", "Error", "Loading..."):
        return
    prev = _last_signal.get(ticker)
    _last_signal[ticker] = signal
    if prev is None or prev == signal:
        return
    now = time.time()
    if now - _last_sent.get(ticker, 0) < COOLDOWN_SECONDS:
        return
    _last_sent[ticker] = now
    price_s = f" @ ${price:.2f}" if price is not None else ""
    send_text(f"⚡ {ticker}: {prev} → {signal}{price_s} · regime {regime_verdict}")
