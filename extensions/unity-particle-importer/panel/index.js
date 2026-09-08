'use strict';
// -----------------------------------------------------------------------------
//  panel/index.js — the "Unity Particle Importer" dockable panel.
//  Thin UI: everything real happens in main.js.
// -----------------------------------------------------------------------------

module.exports = Editor.Panel.define({
    template: `
<div class="wrap">
  <header>
    <h2>Unity → Cocos particle import</h2>
    <p>Pick the <code>.uparticle.json</code> that Unity exported. Textures, materials
       and the ParticleSystem nodes are created for you.</p>
  </header>

  <section class="row">
    <label>Export file</label>
    <ui-input id="json" placeholder="…/Fx_Explosion/Fx_Explosion.uparticle.json"></ui-input>
    <ui-button id="browse">Browse…</ui-button>
  </section>

  <section class="row">
    <label>Import into</label>
    <ui-input id="target" value="db://assets/UnityParticles"></ui-input>
  </section>

  <section class="row opts">
    <ui-checkbox id="prefab" checked>Also save a prefab</ui-checkbox>
  </section>

  <section class="row">
    <ui-button id="run" class="primary">Import</ui-button>
  </section>

  <section class="log">
    <div id="out"></div>
  </section>
</div>`,

    style: `
:host { display:flex; height:100%; }
.wrap { display:flex; flex-direction:column; gap:8px; padding:12px; width:100%; box-sizing:border-box; }
header h2 { margin:0 0 4px; font-size:14px; }
header p { margin:0 0 4px; opacity:.7; font-size:11px; line-height:1.5; }
.row { display:flex; align-items:center; gap:8px; }
.row label { width:86px; flex:none; font-size:12px; }
.row ui-input { flex:1; }
.row.opts { padding-left:94px; }
#run { min-width:120px; }
.log { flex:1; overflow:auto; border:1px solid var(--color-normal-border,#2a2a2a);
       border-radius:3px; padding:8px; font-size:11px; line-height:1.6; }
.log .ok   { color:#7ec87e; }
.log .warn { color:#e0b062; }
.log .comp { color:#7fb6e0; }
.log .err  { color:#e07070; }
.log div { white-space:pre-wrap; word-break:break-word; }`,

    $: {
        json: '#json',
        target: '#target',
        prefab: '#prefab',
        browse: '#browse',
        run: '#run',
        out: '#out',
    },

    methods: {
        print(text, cls) {
            const line = document.createElement('div');
            line.className = cls || '';
            line.textContent = text;
            this.$.out.appendChild(line);
            this.$.out.scrollTop = this.$.out.scrollHeight;
        },
    },

    ready() {
        this.$.browse.addEventListener('confirm', async () => {
            const picked = await Editor.Message.request('unity-particle-importer', 'pick-json');
            if (picked) this.$.json.value = picked;
        });

        this.$.run.addEventListener('confirm', async () => {
            const jsonPath = this.$.json.value.trim();
            if (!jsonPath) { this.print('Pick an export file first.', 'err'); return; }

            this.$.out.innerHTML = '';
            this.$.run.setAttribute('disabled', '');
            this.print(`Importing ${jsonPath} …`);

            const report = await Editor.Message.request('unity-particle-importer', 'import-file',
                jsonPath,
                this.$.target.value.trim() || 'db://assets',
                { createPrefab: this.$.prefab.getAttribute('checked') !== null });

            this.$.run.removeAttribute('disabled');

            if (!report || !report.ok) {
                this.print(`Failed: ${report ? report.error : 'no response'}`, 'err');
                return;
            }

            this.print(`Done → ${report.root}`, 'ok');
            for (const line of report.log) {
                // "~" lines are Unity features re-simulated with Cocos parameters,
                // "!" lines are genuine differences the artist should look at.
                if (line.startsWith('!')) this.print(line, 'warn');
                else if (line.startsWith('~')) this.print(line, 'comp');
                else this.print(line);
            }
        });
    },

    beforeClose() { },
    close() { },
});
