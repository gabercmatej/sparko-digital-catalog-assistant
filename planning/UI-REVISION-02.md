# UI revision 02

User-requested changes supersede the earlier visual section of the build plan:
- Pure white chat background.
- Official SPAR horizontal logo in top header; use original vector/high-resolution asset in app.
- Šparko character on welcome screen and a small assistant avatar during conversation.
- Smaller 1:1 square product tiles, sharp corners, light gray backgrounds.
- Catalog-style red price blocks; natural product image proportions.
- Keep rounding for chat bubbles and controls only.

sparko-ui-direction-v2.png is an AI-generated visual proposal made with the built-in image tool.
It is not an implementation or a source for official logos, packaging, prices, or exact geometry.
The CSS specification is authoritative for exact square geometry; generation is approximate.
Use original product assets and data when implementing. Svinjski zrezki are 500 g.

Final refinement prompt:
Precisely revise this UI mockup, preserving all three phones, mascot, logos, colors, white background, text and layout except following corrections. All product cards MUST have perfectly SHARP 90-degree corners zero radius, and exact equal width and height. Top carousel tiles in first two phones currently too tall: retain existing width about 113 image pixels, reduce height to exactly 113 pixels (currently about 142px), fitting smaller proportion-preserved packshot and two compact text lines with red price block. Do not stretch any product photos. Personal catalog screen tiles currently too tall: each width ~179 pixels so reduce height to exactly 179 pixels. Reflow labels beneath photos inside square using compact text, keep price red square corner blocks. Middle phone featured skuta tile width ~218 px: make its height exactly 218px too, zero corner radius. Ensure all tiles light gray, backgrounds outside tiles pure white. Correct rightmost pork product description from '400 g' to '500 g'. The salama stays 400 g. Preserve all other text and precise logo styling. Make these changes observable, especially true geometric square product containers. Finished sharp premium UI design board.
