from PIL import Image

def remove_background(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    datas = img.getdata()

    newData = []
    for item in datas:
        # Use lightness as alpha
        lightness = max(item[0], item[1], item[2])
        if lightness == 0:
            newData.append((0, 0, 0, 0))
        else:
            alpha = lightness
            # Un-premultiply
            r = min(255, int((item[0] / alpha) * 255))
            g = min(255, int((item[1] / alpha) * 255))
            b = min(255, int((item[2] / alpha) * 255))
            newData.append((r, g, b, alpha))

    img.putdata(newData)
    img.save(output_path, "PNG")

remove_background(
    r"C:\Users\Cody\.gemini\antigravity\brain\3b8c4802-ab00-4de8-a7f2-d4bd994903f8\simple_treasure_chest_1782782930991.png",
    r"C:\Users\Cody\GameVault\public\vault-empty.png"
)
