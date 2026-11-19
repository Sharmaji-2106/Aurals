"""AURALS Multi-Output — play what Windows is playing on several devices at once.

Captures the sound of one output device (WASAPI loopback: whatever Windows sends
it) and plays it, live, on every device you tick — USB DACs, IEMs on dongles,
Bluetooth headphones — each with its own volume and delay.

Why a delay: every device has its own latency. Bluetooth usually arrives
150–250 ms after a wired device, so give the wired ones that much delay and
they line up. Each device also has its own clock; if one runs slow, the oldest
sound is dropped to keep it from falling behind.

    python app.py            the window
    python app.py --list     list devices and exit
"""

from __future__ import annotations

import queue
import sys
import threading
import tkinter as tk
from tkinter import ttk

import numpy as np
import soundcard as sc

RATE = 48000
BLOCK = 480  # 10 ms
MAX_BACKLOG = 25  # blocks: beyond this the oldest is dropped (drift)

BG, PANEL, INK, MUTED, ACCENT = "#120d18", "#1d1624", "#f3ece6", "#9b90a5", "#f0956a"


class Output(threading.Thread):
    """One device: plays blocks from its queue, after its own delay, at its own volume."""

    def __init__(self, speaker, gain: float, delay_ms: int):
        super().__init__(daemon=True)
        self.speaker, self.gain, self.delay_ms = speaker, gain, delay_ms
        self.q: queue.Queue = queue.Queue(maxsize=400)
        self.running = True
        self.error: str | None = None

    def run(self) -> None:
        try:
            with self.speaker.player(samplerate=RATE, channels=2, blocksize=BLOCK) as player:
                for _ in range(self.delay_ms // 10):
                    player.play(np.zeros((BLOCK, 2), np.float32))
                while self.running:
                    try:
                        block = self.q.get(timeout=0.2)
                    except queue.Empty:
                        continue
                    while self.q.qsize() > MAX_BACKLOG:
                        self.q.get_nowait()
                    player.play(block * self.gain)
        except Exception as exc:  # a device unplugged, or refused the format
            self.error = str(exc)


class Router:
    """Loopback capture from one device, fanned out to many."""

    def __init__(self) -> None:
        self.outputs: dict[str, Output] = {}
        self.stop = threading.Event()
        self.thread: threading.Thread | None = None
        self.error: str | None = None

    def start(self, source_name: str) -> None:
        self.stop.clear()
        self.thread = threading.Thread(target=self._capture, args=(source_name,), daemon=True)
        self.thread.start()

    def _capture(self, source_name: str) -> None:
        try:
            mic = sc.get_microphone(id=source_name, include_loopback=True)
            with mic.recorder(samplerate=RATE, channels=2, blocksize=BLOCK) as rec:
                while not self.stop.is_set():
                    data = rec.record(numframes=BLOCK).astype(np.float32)
                    if data.ndim == 1 or data.shape[1] == 1:
                        data = np.repeat(data.reshape(-1, 1), 2, axis=1)
                    for out in list(self.outputs.values()):
                        try:
                            out.q.put_nowait(data)
                        except queue.Full:
                            pass
        except Exception as exc:
            self.error = str(exc)

    def add(self, name: str, speaker, gain: float, delay_ms: int) -> None:
        self.remove(name)
        out = Output(speaker, gain, delay_ms)
        self.outputs[name] = out
        out.start()

    def remove(self, name: str) -> None:
        out = self.outputs.pop(name, None)
        if out:
            out.running = False

    def shutdown(self) -> None:
        self.stop.set()
        for name in list(self.outputs):
            self.remove(name)


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("AURALS Multi-Output")
        self.configure(bg=BG)
        self.minsize(640, 420)
        self.router = Router()
        self.running = False
        self.rows: dict[str, dict] = {}
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TCombobox", fieldbackground=PANEL, background=PANEL, foreground=INK)
        style.configure("Horizontal.TScale", background=PANEL, troughcolor="#2c2235")

        tk.Label(self, text="AURALS", fg=ACCENT, bg=BG, font=("Georgia", 22, "italic")).pack(
            anchor="w", padx=22, pady=(18, 0)
        )
        tk.Label(
            self, text="Play what Windows is playing on several devices at once.", fg=MUTED, bg=BG,
            font=("Segoe UI", 10),
        ).pack(anchor="w", padx=22)

        top = tk.Frame(self, bg=BG)
        top.pack(fill="x", padx=22, pady=(16, 8))
        tk.Label(top, text="Capture from", fg=INK, bg=BG, font=("Segoe UI", 10)).pack(side="left")
        self.source = ttk.Combobox(top, state="readonly", width=48)
        self.source.pack(side="left", padx=10)
        tk.Button(top, text="Refresh", command=self.refresh, bg=PANEL, fg=INK, relief="flat",
                  activebackground="#2c2235", activeforeground=INK, padx=10).pack(side="left")

        self.list = tk.Frame(self, bg=BG)
        self.list.pack(fill="both", expand=True, padx=22)

        bottom = tk.Frame(self, bg=BG)
        bottom.pack(fill="x", padx=22, pady=16)
        self.go = tk.Button(bottom, text="Start", command=self.toggle, bg=ACCENT, fg="#1b1220",
                            relief="flat", font=("Segoe UI", 11, "bold"), padx=26, pady=6,
                            activebackground="#ffb08a")
        self.go.pack(side="left")
        self.status = tk.Label(bottom, text="", fg=MUTED, bg=BG, font=("Segoe UI", 9), justify="left",
                               wraplength=470)
        self.status.pack(side="left", padx=14)
        self.hint(
            "Tick the devices to play on. Bluetooth usually runs 150–250 ms behind wired: give the "
            "wired ones that much delay to line them up."
        )
        self.refresh()
        self.protocol("WM_DELETE_WINDOW", self.close)
        self.after(500, self.watch)

    def hint(self, text: str) -> None:
        self.status.configure(text=text)

    def refresh(self) -> None:
        if self.running:
            return
        speakers = sc.all_speakers()
        default = sc.default_speaker()
        self.speakers = {s.name: s for s in speakers}
        self.source["values"] = [s.name for s in speakers]
        self.source.set(default.name)
        for w in self.list.winfo_children():
            w.destroy()
        self.rows.clear()
        head = tk.Frame(self.list, bg=BG)
        head.pack(fill="x", pady=(4, 2))
        for text, width in (("Play on", 34), ("Volume", 16), ("Delay (ms)", 16)):
            tk.Label(head, text=text, fg=MUTED, bg=BG, width=width, anchor="w",
                     font=("Segoe UI", 9)).pack(side="left")
        for s in speakers:
            row = tk.Frame(self.list, bg=PANEL, padx=10, pady=6)
            row.pack(fill="x", pady=3)
            on = tk.BooleanVar(value=False)
            tk.Checkbutton(row, text=s.name[:42], variable=on, fg=INK, bg=PANEL, selectcolor=BG,
                           activebackground=PANEL, activeforeground=INK, anchor="w", width=34,
                           font=("Segoe UI", 10)).pack(side="left")
            vol = tk.DoubleVar(value=80)
            ttk.Scale(row, from_=0, to=100, variable=vol, length=110,
                      command=lambda _v, n=s.name: self.retune(n)).pack(side="left", padx=8)
            delay = tk.IntVar(value=0)
            tk.Spinbox(row, from_=0, to=1000, increment=10, textvariable=delay, width=6,
                       bg=BG, fg=INK, buttonbackground=PANEL, relief="flat",
                       command=lambda n=s.name: self.redelay(n)).pack(side="left", padx=8)
            self.rows[s.name] = {"on": on, "vol": vol, "delay": delay}

    def gain(self, name: str) -> float:
        v = self.rows[name]["vol"].get() / 100
        return v * v  # perceptual

    def retune(self, name: str) -> None:
        out = self.router.outputs.get(name)
        if out:
            out.gain = self.gain(name)

    def redelay(self, name: str) -> None:
        if self.running and name in self.router.outputs:
            self.router.add(name, self.speakers[name], self.gain(name), int(self.rows[name]["delay"].get()))

    def toggle(self) -> None:
        if self.running:
            self.router.shutdown()
            self.router = Router()
            self.running = False
            self.go.configure(text="Start")
            self.hint("Stopped.")
            return
        chosen = [n for n, r in self.rows.items() if r["on"].get()]
        if not chosen:
            self.hint("Tick at least one device to play on.")
            return
        source = self.source.get()
        for name in chosen:
            self.router.add(name, self.speakers[name], self.gain(name), int(self.rows[name]["delay"].get()))
        self.router.start(source)
        self.running = True
        self.go.configure(text="Stop")
        echo = " The source is ticked too, so it will play twice — untick it or pick another source." \
            if source in chosen else ""
        self.hint(f"Playing on {len(chosen)} device(s) from “{source}”.{echo}")

    def watch(self) -> None:
        if self.running:
            failed = [n for n, o in self.router.outputs.items() if o.error]
            if self.router.error:
                self.hint(f"Capture stopped: {self.router.error}")
            elif failed:
                self.hint(f"Stopped on: {', '.join(failed)} (unplugged, or the format was refused).")
        self.after(1000, self.watch)

    def close(self) -> None:
        self.router.shutdown()
        self.destroy()


def main() -> None:
    if "--list" in sys.argv:
        print("default:", sc.default_speaker().name)
        for s in sc.all_speakers():
            print(" -", s.name)
        return
    App().mainloop()


if __name__ == "__main__":
    main()
