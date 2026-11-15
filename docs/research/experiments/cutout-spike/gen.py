import ssl, sys, json, base64, urllib.request, subprocess, time, concurrent.futures as cf, os
CTX = ssl.create_default_context(cafile='/etc/ssl/cert.pem')
OUT = os.path.join(os.path.dirname(__file__), 'img')
TOKEN = subprocess.check_output(['gcloud','auth','print-access-token']).decode().strip()
URL = 'https://aiplatform.googleapis.com/v1/projects/motionpop-48409/locations/global/publishers/google/models/{m}:generateContent'
LOOKS = {
 'fn': 'documentary photograph, soft natural daylight, slightly desaturated, realistic, 35mm film look',
 'pc': 'vintage 1970s magazine photo cut-out, visible halftone print dots, slightly faded warm colours',
 'ee': 'clean studio photograph, soft even light, neutral colours, crisp detail',
}
SUBJ = {
 'hair': 'a woman with voluminous curly hair, head and shoulders, facing the camera',
 'glass': 'a clear glass bottle of water',
 'bike': 'a vintage bicycle seen from the side',
 'mug': 'a plain white ceramic coffee mug',
}
BG = ('One single subject, centred, the entire subject visible with empty margin around it. '
      'Background: perfectly flat, uniform, pure chroma green (#00FF00), no shadow, no gradient, no floor, no reflection. '
      'No text, no logos, no watermark.')
def call(model, parts, name, size='1K'):
    body = {'contents':[{'role':'user','parts':parts}],
            'generationConfig':{'responseModalities':['IMAGE'],'imageConfig':{'aspectRatio':'1:1','imageSize':size}}}
    req = urllib.request.Request(URL.format(m=model), json.dumps(body).encode(),
          {'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json','x-goog-user-project':'motionpop-48409'})
    if os.path.exists(os.path.join(OUT,name+'.png')): return name, 'exists'
    t0=time.time()
    for attempt in range(6):
        try:
            r = json.load(urllib.request.urlopen(req, timeout=180, context=CTX)); break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5: time.sleep(15*(attempt+1)); continue
            return name, 'HTTP %d %s' % (e.code, e.read()[:120].decode('utf8','replace').replace('\n',' '))
    dt=time.time()-t0
    for p in r.get('candidates',[{}])[0].get('content',{}).get('parts',[]):
        if 'inlineData' in p:
            open(os.path.join(OUT,name+'.png'),'wb').write(base64.b64decode(p['inlineData']['data']))
            return name, 'ok %.1fs %s usage=%s' % (dt, p['inlineData']['mimeType'], json.dumps(r.get('usageMetadata',{}))[:160])
    return name, 'no image: '+json.dumps(r)[:300]
def img_part(path):
    return {'inlineData':{'mimeType':'image/png','data':base64.b64encode(open(path,'rb').read()).decode()}}
if __name__ == '__main__':
    mode = sys.argv[1]
    jobs=[]
    if mode == 'base':
        for lk, rec in LOOKS.items():
            for sk, s in SUBJ.items():
                jobs.append(('gemini-nano-banana-2.1', [{'text': f'{s}, {rec}. {BG}'}], f'{lk}-{sk}'))
    elif mode == 'light':   # same prompt + neutral-light line, on the subjects that picked up green bounce
        NL = ' The subject is lit only by neutral white light: no green light, green tint or green reflection on the subject.'
        for lk, sk in (('fn','mug'),('fn','glass'),('ee','mug')):
            jobs.append(('gemini-nano-banana-2.1', [{'text': f'{SUBJ[sk]}, {LOOKS[lk]}. {BG}{NL}'}], f'{lk}-{sk}-nl'))
    elif mode == 'white':   # second edit pass on hard ones
        for n in sys.argv[2:]:
            jobs.append(('gemini-nano-banana-2.1', [img_part(os.path.join(OUT,n+'.png')),
              {'text':'Keep exactly the same subject, pose and style. Replace the whole background with perfectly flat pure white (#FFFFFF). No shadow.'}], n+'-white'))
    elif mode == 'refs':    # style lock: new subjects with 2 reference images
        refs=[img_part(os.path.join(OUT,'pc-bike.png')), img_part(os.path.join(OUT,'pc-mug.png'))]
        new={'ship':'a large cargo container ship seen from the side','phone':'an old rotary telephone'}
        for m,tag in (('gemini-nano-banana-2.1','nb21'),('gemini-3.1-flash-image','f31')):
            for k,s in new.items():
                jobs.append((m, refs+[{'text': f'Using the two reference images only for visual style (print texture, colour, lighting), create: {s}. {BG}'}], f'ref-{tag}-{k}'))
                if tag=='nb21': jobs.append((m, [{'text': f"{s}, {LOOKS['pc']}. {BG}"}], f'noref-{k}'))
    with cf.ThreadPoolExecutor(2) as ex:
        for name, res in ex.map(lambda j: call(*j), jobs): print(name, res)
