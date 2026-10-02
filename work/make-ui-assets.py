from pathlib import Path
import base64,html
import pymupdf as fitz
r=Path(r'C:\Users\Maj\OneDrive - 12media.si\Dokumenti\Claude\Šparko')
u=r/'assets/ui'
(u/'design-tokens.css').write_text('''/* ŠPARKO — proposed MVP tokens; native UI assets, 2026-10-02 */
:root {
  --color-canvas: #f4f5f4;
  --color-surface: #fafbfa;
  --color-surface-muted: #e9eeeb;
  --color-ink: #163b2d;
  --color-ink-muted: #57685e;
  --color-primary: #007a43;
  --color-primary-soft: #e0eee4;
  --color-price: #e30620;
  --color-price-ink: #c5001b;
  --color-border: #d5ded8;
  --color-focus: #005b34;
  --color-highlight: rgb(0 122 67 / 14%);
  --font-ui: 'Segoe UI', system-ui, sans-serif;
  --text-body: 1rem;
  --text-small: .875rem;
  --text-price: 1.875rem;
  --radius-card: 1.125rem;
  --radius-control: .875rem;
  --space-1: .25rem;
  --space-2: .5rem;
  --space-3: .75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --tap-min: 2.75rem;
  --content-max: 48rem;
}
/* Include safe-area-inset-bottom in the composer and floating actions.
   Keep product media square; allow titles and buttons to grow with text.
   Use focus-visible outlines and status text in addition to color.
   Offer conditions and validity must stay readable, not hidden in tooltips. */
''',encoding='utf-8')
(u/'icons.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg"><defs>
<symbol id="menu" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></symbol>
<symbol id="new-chat" viewBox="0 0 24 24"><path d="M12 5H5v14h14v-7M15 5h6m-3-3v6"/></symbol>
<symbol id="catalog" viewBox="0 0 24 24"><path d="M5 3h14v19l-7-4-7 4Z"/></symbol>
<symbol id="leaflet" viewBox="0 0 24 24"><path d="M12 5C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/></symbol>
<symbol id="check" viewBox="0 0 24 24"><path d="m4 12 5 5L20 6"/></symbol>
<symbol id="send" viewBox="0 0 24 24"><path d="m3 3 18 9-18 9 4-9Zm4 9h14"/></symbol>
<symbol id="chat" viewBox="0 0 24 24"><path d="M4 3h16v14H9l-5 4Z"/></symbol>
<symbol id="plus" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"/></symbol>
<symbol id="close" viewBox="0 0 24 24"><path d="m5 5 14 14M5 19 19 5"/></symbol>
<symbol id="microphone-off" viewBox="0 0 24 24"><path d="M9 9V5a3 3 0 0 1 6 0v6m-9-1v2a6 6 0 0 0 10 4M12 18v4m-4 0h8M3 3l18 18"/></symbol>
</defs></svg>''',encoding='utf-8')
S=[]
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1):
 S.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>')
def text(x,y,t,size=14,fill='#163b2d',weight=400):
 S.append(f'<text x="{x}" y="{y}" font-family="Segoe UI,Arial,sans-serif" font-size="{size}" fill="{fill}" font-weight="{weight}">{html.escape(t)}</text>')
def pic(path,x,y,w,h):
 data=base64.b64encode(path.read_bytes()).decode()
 S.append(f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,{data}"/>')
def line(x,y,x2,y2,c='#d5ded8',sw=1): S.append(f'<path d="M{x} {y}L{x2} {y2}" fill="none" stroke="{c}" stroke-width="{sw}" stroke-linecap="round"/>')
def button(x,y,w,label,filled=True):
 rect(x,y,w,42,'#007a43' if filled else '#e0eee4',12)
 text(x+14,y+27,label,14,'#ffffff' if filled else '#007a43',600)
def phone(x,title,n):
 rect(x-5,191,370,754,'#dfe6e1',31)
 rect(x,185,360,754,'#f4f5f4',28,'#cad5cd')
 text(x+22,220,'9:41',12,weight=600); text(x+299,220,'•••',13)
 for yy in (247,253,259):line(x+20,yy,x+37,yy,'#163b2d',2)
 text(x+56,260,title,20,weight=750)
 text(x+317,260,'+',24,weight=500)
 line(x+16,277,x+344,277)
 text(x,982,n,17,weight=650)

S.append('<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="1090" viewBox="0 0 1320 1090">')
rect(0,0,1320,1090,'#e9eeeb')
text(60,65,'ŠPARKO',24,weight=800)
text(60,110,'Od pogovora do tvojega kataloga.',34,weight=650)
text(60,145,'Predlog mobilne izkušnje · dejanski izdelki iz priloženega kataloga · statična oblikovna smer',16,'#57685e')
x=60;phone(x,'ŠPARKO','01  Pogovor, ki vodi do izdelka')
text(x+20,302,'DEMO KATALOG · 30. 9. 2026',10,'#57685e',650)
for xx,name,fn,price in [(x+16,'Lahka skuta','sb-skuta-1kg','3,38 €'),(x+129,'Pommes frites','sb-pommes-1kg','1,59 €'),(x+242,'Pišč. salama','sb-salama-400g','0,99 €')]:
 rect(xx,315,103,129,'#fafbfa',13,'#d5ded8')
 pic(r/f'assets/products/{fn}.png',xx+20,321,62,67)
 text(xx+8,405,name,11,weight=550);text(xx+8,430,price,18,'#c5001b',750)
rect(x+147,465,196,42,'#e0eee4',17);text(x+163,492,'Koliko stane skuta?',15)
text(x+20,540,'V tem katalogu je 1 kg lahke',16)
text(x+20,565,'skute S-BUDGET naveden po 3,38 €.',15)
rect(x+16,586,328,220,'#fafbfa',17,'#d5ded8')
pic(r/'assets/products/sb-skuta-1kg.png',x+32,604,92,101)
text(x+139,620,'S-BUDGET',11,'#57685e',650)
text(x+139,648,'Lahka skuta',19,weight=700)
text(x+139,670,'10 % m. m. · 1 kg',12,'#57685e')
text(x+139,704,'3,38 €',29,'#c5001b',750)
text(x+32,729,'Cena iz demo kataloga · PDF-stran 5',11,'#57685e')
button(x+30,746,300,'+  Dodaj v Moj katalog')
text(x+26,835,'Pogovor',13,'#007a43',650);text(x+198,835,'Moj katalog  0',13,'#57685e')
rect(x+16,851,328,56,'#fafbfa',18,'#d5ded8');text(x+32,885,'Vprašaj Šparka …',14,'#57685e');rect(x+291,861,38,36,'#007a43',12);text(x+302,886,'↑',21,'white')

x=480;phone(x,'Moj katalog','02  Tvoj izbor + pojasnjena priporočila')
text(x+20,309,'Tvoj izbor. Ideje zate.',16,'#57685e')
text(x+20,350,'Tvoji izdelki',21,weight=700);text(x+298,349,'1',16,'#007a43',700)
rect(x+16,369,158,258,'#fafbfa',17,'#d5ded8')
text(x+29,394,'✓ SHRANJENO',10,'#007a43',700)
pic(r/'assets/products/sb-skuta-1kg.png',x+46,406,93,107)
text(x+29,537,'S-BUDGET',10,'#57685e',600);text(x+29,557,'Lahka skuta',16,weight=650)
text(x+29,578,'1 kg',12,'#57685e');text(x+29,609,'3,38 €',25,'#c5001b',750)
rect(x+187,369,157,258,'#e9eeeb',17)
text(x+207,462,'Tvoj katalog',17,weight=600);text(x+207,486,'raste s tabo.',17,weight=600)
text(x+207,524,'Dodaj še kaj iz',12,'#57685e');text(x+207,543,'spodnjih predlogov.',12,'#57685e')
text(x+20,666,'Priporočeno zate',21,weight=700)
text(x+20,689,'Tudi iz linije S-BUDGET',13,'#57685e')
rect(x+16,706,328,113,'#e0eee4',17)
pic(r/'assets/products/sb-pommes-1kg.png',x+27,716,59,83)
text(x+102,733,'Pommes frites · 1 kg',15,weight=650)
text(x+102,759,'1,59 €',22,'#c5001b',750)
text(x+102,794,'+ Dodaj v Moj katalog',13,'#007a43',650)
button(x+142,839,202,'Odpri SPAR letak  →')
text(x+24,915,'Pogovor',13,'#57685e');text(x+199,915,'Moj katalog  1',13,'#007a43',650)

x=900;phone(x,'SPAR letak','03  Isti izdelki, označeni v letaku')
text(x+20,308,'Originalni letak · tvoj izbor je označen',12,'#57685e')
rect(x+16,327,328,37,'#e0eee4',11);text(x+29,351,'✓  Samo strani z mojimi izdelki',13,'#007a43',600)
# Original rendered page, proportion preserved. One selection matches the skuta block.
px=x+16;py=380;pw=328;ph=445.1
pic(r/'work/page-05.png',px,py,pw,ph)
rect(px+pw*.665,py+ph*.737,pw*.335,ph*.232,'#007a43',2)
# Repaint original image within selected region through clipping, then translucent selection.
S.append(f'<defs><clipPath id="selected"><rect x="{px+pw*.665}" y="{py+ph*.737}" width="{pw*.335}" height="{ph*.232}"/></clipPath></defs>')
S.append('<g clip-path="url(#selected)">');pic(r/'work/page-05.png',px,py,pw,ph);S.append('</g>')
S.append(f'<rect x="{px+pw*.665}" y="{py+ph*.737}" width="{pw*.335-2}" height="{ph*.232}" fill="#007a43" fill-opacity=".10" stroke="#005b34" stroke-width="3"/>')
rect(px+pw*.665+3,py+ph*.737+3,103,20,'#005b34',4);text(px+pw*.665+9,py+ph*.737+17,'✓ V tvojem katalogu',9,'#ffffff',600)
text(x+19,847,'‹',25);text(x+137,846,'5 / 38',15,weight=600);text(x+321,847,'›',25)
rect(x+16,866,328,51,'#fafbfa',12,'#d5ded8');text(x+29,887,'Dotakni se označenega izdelka.',12,weight=650);text(x+29,905,'V MVP je interaktiven izbrani del ponudbe.',11,'#57685e')
text(60,1030,'Ključni princip: en izdelek, en vir podatkov, enako stanje v vseh treh pogledih.',19,weight=650)
text(60,1060,'Cene so iz demo kataloga. Pogoji in veljavnost sodijo na dejanske kartice. To ni prikaz delujoče aplikacije.',13,'#57685e')
S.append('</svg>')
svg=''.join(S)
(u/'sparko-ui-direction.svg').write_text(svg,encoding='utf-8')
doc=fitz.open(stream=svg.encode(),filetype='svg')
doc[0].get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(u/'sparko-ui-direction.png')
print('UI tokens, SVG icon symbols, static design board and preview saved.')
