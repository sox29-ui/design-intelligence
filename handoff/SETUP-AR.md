# دليل الإعداد على Windows — نقل DI v0.1.0 إلى مشروع AI-Framework

## 1. المصدر
- المستودع: https://github.com/sox29-ui/design-intelligence
- الفرع: `claude/design-intelligence-architecture-7j2pl5` (الفرع `main` يحوي أول commit فقط ولا يحوي العمل)
- آخر commit: رقمه في رسالة التسليم النهائية، أو دائمًا: `git rev-parse origin/claude/design-intelligence-architecture-7j2pl5`
- نقطة تجميد v0.1.0: الـ commit `e012194` (القواعد والـ skill لم يتغيّرا بعدها). للتحقق:
  `git diff --stat e012194 HEAD -- .claude/skills datasets/rules` يجب أن يكون فارغًا.
- المستودع قد يكون خاصًا: سجّل الدخول عبر Git Credential Manager أو `gh auth login`.

## 2. مواقع الملفات
| المحتوى | المسار داخل المستودع |
|---|---|
| نقطة البداية للتسليم | `handoff\README.md` ثم `handoff\INTEGRATION.md` |
| هذا الدليل + أول prompt | `handoff\SETUP-AR.md`، `handoff\FIRST-PROMPT-AR.md` |
| تصدير المعرفة (JSON) + schema | `handoff\di-knowledge-v0.1.0.json` (+ `.full.json` مع كل الأدلة) — `schemas\knowledge-export.schema.json` |
| قائمة الملفات مع SHA-256 | `handoff\MANIFEST.json` |
| حزمة الـ skill (ZIP) + بصمتها | `handoff\design-intelligence-v0.1.0.zip` + `.sha256` |
| الـ skill نفسه | `.claude\skills\design-intelligence\` (SKILL.md، references، workflows، scripts) |
| القواعد (مصدر الحقيقة) والمرشّحون لـ v0.2 | `datasets\rules\`، `datasets\candidates\` (cc-0001…cc-0014) |
| الأدلة والـ corpus والمصادر | `datasets\observations\`، `datasets\raw\`، `datasets\corpus.yaml`، `provenance\sources.yaml` |
| المدقّق وأدوات المتصفح | `.claude\skills\design-intelligence\scripts\verify-page.ts`, `inspect-page.ts` |
| أدوات المستودع | `scripts\` (validate، export-knowledge، score-benchmark، …) |
| التقييم والـ benchmarks | `evals\briefs\`، `evals\rubrics\`، `evals\harness\PROTOCOL.md`، `evals\results\cycle-01\REPORT.md` |
| القرارات والسجل | `docs\DECISIONS.md` (D-001…D-021)، `docs\JOURNAL.md`، `CHANGELOG.md` |

## 3. المتطلبات على Windows
- Node.js ≥ 22.18 (LTS 22 أو أحدث): `node --version`
- Git: `git --version`
- مساحة ≈ 1 GB (تبعيات + Chromium). لا حاجة لـ Python الآن.

## 4. الاستنساخ والتثبيت (PowerShell)
```powershell
cd $HOME\Desktop
git clone --branch claude/design-intelligence-architecture-7j2pl5 https://github.com/sox29-ui/design-intelligence.git DI-Source
cd DI-Source
git log -1 --oneline
npm ci
npx playwright install chromium
npm test
npm run test:browser
```
- `npm ci` يستخدم `package-lock.json` (إصدارات مثبّتة: Playwright 1.56.1، axe 4.13، Lighthouse 13.5).
- كل الاختبارات يجب أن تنجح. لا تعطّل التحقق من TLS إن ظهرت أخطاء شهادات.
- التحقق من الحزمة:
```powershell
cd handoff; Get-FileHash design-intelligence-v0.1.0.zip -Algorithm SHA256; Get-Content design-intelligence-v0.1.0.zip.sha256; cd ..
```

### <a id="windows-warning"></a>تحذير Windows (مهم)
أوامر الـ CLI في `scripts\*.ts` (مثل `npm run validate`) تستخدم شرطًا لا يتطابق مع مسارات Windows، فتنتهي **بصمت دون تنفيذ** (candidate cc-0014؛ لم تُجرَّب على Windows). لذلك:
- اعتمد على `npm test` كمرجع للتحقق (الاختبارات تستورد الدوال مباشرة ولا تتأثر).
- إن لم يطبع `npm run validate` سطر `validate: 0 error(s)` فهذا هو العطل نفسه، لا نجاح.
- الإصلاح المقترح (لاحقًا، في `scripts\` فقط، ليس في قواعد أو skill): استبدال الشرط بـ `pathToFileURL(process.argv[1]).href === import.meta.url`. الـ Framework يستورد `verify()` كمكتبة، فلا يحتاج الشرط.
- بديل: التشغيل داخل WSL.

## 5. إنشاء مشروع AI-Framework (بدون المساس بالمستودع الأصلي)
القاعدة: لا تنسخ ملفات DI داخل المشروع الجديد؛ اربطه كمرجع مثبّت.
```powershell
cd $HOME\Desktop
mkdir AI-Framework; cd AI-Framework
git init -b main
git submodule add https://github.com/sox29-ui/design-intelligence.git vendor/di
cd vendor\di
git checkout <SHA-من-رسالة-التسليم>
cd ..\..
git add .gitmodules vendor/di
git commit -m "chore: vendor DI v0.1.0 (pinned, read-only)"
npm init -y
```
- بعد الـ checkout يكون `vendor\di` على commit محدد (detached) فلا يتغيّر عرضًا. لا تعدّل شيئًا داخله.
- التبعيات التي يحتاجها الـ Framework (Playwright وغيره) تُثبَّت في AI-Framework نفسه؛ ولتشغيل أدوات DI من `vendor\di` نفّذ فيه `npm ci` مرة واحدة.
- ترقية DI لاحقًا = نقل المؤشر إلى commit جديد في commit مستقل ومراجَع.

## 6. لماذا submodule وليس النسخ؟
| الخيار | الحكم |
|---|---|
| **submodule مثبّت (موصى به)** | تاريخ Git الأصلي سليم، المصدر لا يُعدَّل عرضًا، الترقية صريحة |
| `git subtree add --prefix=vendor/di … ` (بدون `--squash`) | بديل إن أردت مستودعًا واحدًا بلا submodules؛ يحفظ التاريخ داخل الجديد لكنه يخلط الملفات |
| نسخ المجلد | غير موصى به: يضيع التاريخ والتحقق من البصمات |

استورد المعرفة من `vendor\di\handoff\di-knowledge-v0.1.0.json` وتحقق منها مقابل الـ schema قبل أي استخدام؛ ولا تُعدّل الملف — أي تغيير معرفي يمر بمسار candidates → تقييم → مراجعة → إصدار.

## 7. الأمان
- مفتاح Together AI في متغير بيئة فقط: `setx TOGETHER_API_KEY "..."` (أو ملف `.env` مدرج في `.gitignore`). لا يُحفظ في المستودع.
- نموذج رئيسي واحد نشط لكل جلسة مستخدم؛ JEV لاحقًا ولا يُنفَّذ الآن.

## 8. بعد الإعداد
افتح Claude Code داخل `C:\Users\ksa\Desktop\AI-Framework`، وألصق محتوى `handoff\FIRST-PROMPT-AR.md` (موجود أيضًا في رسالة التسليم النهائية).
