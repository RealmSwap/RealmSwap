import sys
from PIL import Image

def process_image(input_path, output_path, size):
    img = Image.open(input_path)
    img = img.resize(size, Image.Resampling.LANCZOS)
    # NSIS requires 24-bit or 8-bit BMP without alpha channel
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        alpha = img.convert('RGBA').split()[-1]
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=alpha)
        img = bg
    else:
        img = img.convert('RGB')
    
    img.save(output_path, 'BMP')
    print(f"Saved {output_path} with size {size}")

if __name__ == "__main__":
    sidebar_in = r"C:\Users\Cody\.gemini\antigravity\brain\43185376-6f72-4c7a-8200-679138f9f890\nsis_sidebar_1783509691120.png"
    sidebar_out = r"C:\Users\Cody\GameVault\build\installerSidebar.bmp"
    # NSIS sidebar standard size: 164x314
    process_image(sidebar_in, sidebar_out, (164, 314))

    header_in = r"C:\Users\Cody\.gemini\antigravity\brain\43185376-6f72-4c7a-8200-679138f9f890\nsis_header_1783509704138.png"
    header_out = r"C:\Users\Cody\GameVault\build\installerHeader.bmp"
    # NSIS header standard size: 150x57
    process_image(header_in, header_out, (150, 57))
