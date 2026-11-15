"""Experiment 2: deterministic beat scheduler. Cues land on spoken words, text gets
read time, quiet gaps get 'juice'. Checks that each energy level hits its budget."""
import json
d = json.load(open("/home/claude/exp/prosody.json")); W = d["truth"]; S = d["score"]
dur = W[-1]["end"] + 0.3
ENERGY = {"calm":3.0, "steady":2.2, "lively":1.6, "hype":1.1}   # max seconds without visible change
READ = lambda nwords: 0.8 + 0.25*nwords                          # hold after text lands
# AI-chosen content cues (what the score JSON would say): word index -> (cue, words on screen)
cues = {2:("hook text",4), 6:("map zoom to canal",0), 11:("number lands",3), 13:("label",3),
        18:("counter flips",2), 22:("ship moves",0)}
# audio-detected stress refines the exact word if within ±1 word
for e_name, gap in ENERGY.items():
    events=[]; hold_until=0
    for i,(cue,nw) in cues.items():
        j = max([i-1,i,i+1], key=lambda k: S[k] if 0<=k<len(W) else -9)
        t = max(W[j]["start"], hold_until)                         # never move text still being read
        events.append((round(t,2), cue, W[j]["word"])); hold_until = t + (READ(nw) if nw else 0)
    events.sort(); filled=[]; last=0.0
    for t,c,w in events + [(dur,"end","")]:
        while t - last > gap:                                      # quiet gap → juice from the look
            last += gap*0.9; filled.append((round(last,2),"juice"))
        last = t
    total = len(events)+len(filled); worst = max(b-a for a,b in zip([0]+[e[0] for e in sorted(events+[(f[0],'j','') for f in filled])],
                                                                     [e[0] for e in sorted(events+[(f[0],'j','') for f in filled])]+[dur]))
    print(f"{e_name:7s} budget {gap}s → {len(events)} content cues + {len(filled)} juice = {total} changes in {dur:.1f}s, longest still gap {worst:.2f}s")
print("cue→word snaps:", [(c,w) for t,c,w in sorted(events)])
