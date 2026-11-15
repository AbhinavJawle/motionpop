"""Experiment: can plain signal processing (no AI) find the stressed words and
pauses in a voiceover, so beats can land on them? Synthetic ground truth via espeak-ng."""
import subprocess, numpy as np, scipy.io.wavfile as wf, re, json, os, tempfile
SR = 22050
script = [("In",0),("March,",0),("one",1),("ship",0),("blocked",0),("the",0),("Suez",0),("Canal.",0),
          ("Every",0),("single",0),("day,",0),("nine",1),("billion",1),("dollars",0),("of",0),("trade",0),("sat",0),("still.",0),
          ("Six",0),("days",0),("later,",0),("it",0),("finally",1),("moved.",0)]
tmp = tempfile.mkdtemp()
def synth(word, emph):
    f = os.path.join(tmp, "w.wav")
    args = ["espeak-ng","-v","en-us","-w",f]
    args += (["-a","190","-p","72","-s","125"] if emph else ["-a","100","-p","48","-s","170"])
    subprocess.run(args+[re.sub(r"[^\w]","",word)], check=True)
    sr, x = wf.read(f); x = x.astype(np.float32)/32768
    # trim espeak's leading/trailing silence
    e = np.abs(x) > 0.01; idx = np.where(e)[0]
    return x[idx[0]:idx[-1]+1] if len(idx) else x
audio, truth, t = [], [], 0.0
for w, emph in script:
    seg = synth(w, emph)
    truth.append({"word":w,"start":t,"end":t+len(seg)/SR,"emph":emph})
    audio.append(seg); t += len(seg)/SR
    gap = 0.42 if w[-1] in ".," else 0.08          # punctuation → real pause
    audio.append(np.zeros(int(gap*SR),np.float32)); t += gap
x = np.concatenate(audio)
# ---- analysis: only uses the waveform + word timings (as a transcriber would give) ----
def f0(seg):
    fr, hop = 1024, 256; vals=[]
    for i in range(0, len(seg)-fr, hop):
        s = seg[i:i+fr]
        if np.sqrt(np.mean(s**2)) < 0.02: continue
        ac = np.correlate(s, s, "full")[fr-1:]
        lo, hi = SR//400, SR//70
        lag = lo + np.argmax(ac[lo:hi]); vals.append(SR/lag)
    return np.median(vals) if vals else np.nan
def syl(w): return max(1, len(re.findall(r"[aeiouy]+", w.lower())))
feat=[]
for w in truth:
    seg = x[int(w["start"]*SR):int(w["end"]*SR)]
    feat.append([20*np.log10(np.sqrt(np.mean(seg**2))+1e-9), f0(seg), (w["end"]-w["start"])/syl(w["word"])])
F = np.array(feat); F = np.where(np.isnan(F), np.nanmean(F,0), F)
Z = (F-F.mean(0))/F.std(0); score = Z.sum(1)
k = sum(e for _,e in script)
picked = set(np.argsort(-score)[:k])
# pause detection from energy alone
fr=int(0.02*SR); env = np.array([np.sqrt(np.mean(x[i:i+fr]**2)) for i in range(0,len(x)-fr,fr)])
sil = env < 0.005; pauses=[]; run=0
for i,s in enumerate(sil):
    run = run+1 if s else 0
    if run*0.02 >= 0.30 and (i+1==len(sil) or not sil[i+1]): pauses.append(round((i+1)*0.02,2))
true_pauses=[round(w["end"],2) for w in truth if w["word"][-1] in ".,"]
hit = sum(1 for i in picked if truth[i]["emph"])
print(f"audio length {len(x)/SR:.1f}s, {len(truth)} words")
print("stressed words found:", [truth[i]["word"] for i in sorted(picked)], f"→ {hit}/{k} correct")
print("top-6 by score:", [(truth[i]["word"], round(score[i],2)) for i in np.argsort(-score)[:6]])
print(f"pauses found {len(pauses)} vs real {len(true_pauses)}:",
      [(p, min(true_pauses,key=lambda q:abs(q-p))) for p in pauses][:8])
json.dump({"truth":truth,"score":score.tolist(),"pauses":pauses}, open("/home/claude/exp/prosody.json","w"))
wf.write("/home/claude/exp/voice.wav", SR, (x*32767).astype(np.int16))
