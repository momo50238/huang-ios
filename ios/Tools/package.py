#!/usr/bin/env python3
"""Build an unsigned iPhone IPA with Xcode or with an LLVM cross-toolchain."""
import argparse
from pathlib import Path
import platform
import plistlib
import shutil
import stat
import subprocess
import tempfile
import zipfile
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Sources" / "Player.m"
RESOURCES = ROOT / "Resources"
TARGET = "arm64-apple-ios15.0"

# Link against public OS libraries. The text stubs list symbol names only.
APPLE_LIBRARIES = (
    ("/usr/lib/libSystem.B.dylib", ("__NSConcreteStackBlock", "__NSConcreteGlobalBlock",
       "__Block_object_assign", "__Block_object_dispose", "__Unwind_Resume", "___stack_chk_fail", "___stack_chk_guard"), ()),
    ("/usr/lib/libobjc.A.dylib", ("_objc_alloc", "_objc_alloc_init", "_objc_autoreleasePoolPush",
       "_objc_autoreleasePoolPop", "_objc_autoreleaseReturnValue", "_objc_retainAutoreleasedReturnValue",
       "_objc_release", "_objc_retain", "_objc_storeStrong", "_objc_msgSend", "_objc_msgSendSuper2",
       "_objc_opt_class", "_objc_setProperty_nonatomic", "__objc_empty_cache", "_objc_retainBlock",
       "_objc_initWeak", "_objc_copyWeak", "_objc_destroyWeak", "_objc_loadWeakRetained",
       "___objc_personality_v0", "_objc_unsafeClaimAutoreleasedReturnValue"), ("NSObject",)),
    ("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation",
       ("___CFConstantStringClassReference",), ()),
    ("/System/Library/Frameworks/Foundation.framework/Foundation", (), ("NSURL", "NSURLRequest", "NSDictionary")),
    ("/System/Library/Frameworks/UIKit.framework/UIKit", ("_UIApplicationMain",),
       ("UIApplication", "UIResponder", "UIViewController", "UIWindow", "UIColor", "UIAlertController", "UIAlertAction")),
    ("/System/Library/Frameworks/WebKit.framework/WebKit", (), ("WKWebView", "WKWebViewConfiguration")),
)


def cross_link(clang, linker, work, executable, player_define):
    obj = work / "Player.o"
    subprocess.run([clang, "--target=" + TARGET, "-fobjc-arc", "-fblocks", "-Os", "-Wall",
                    "-Wextra", "-Wno-unused-parameter", "-Werror", player_define, "-c", str(SOURCE), "-o", str(obj)], check=True)
    stubs = []
    for install_name, symbols, classes in APPLE_LIBRARIES:
        stub = work / (install_name.rsplit("/", 1)[-1] + ".tbd")
        lines = ["--- !tapi-tbd", "tbd-version: 4", "targets: [ arm64-ios ]",
                 f"install-name: {install_name}", "exports:", "  - targets: [ arm64-ios ]"]
        if symbols:
            lines.append("    symbols: [ " + ", ".join(symbols) + " ]")
        if classes:
            lines.append("    objc-classes: [ " + ", ".join(classes) + " ]")
        stub.write_text("\n".join(lines + ["...", ""]), encoding="utf-8")
        stubs.append(str(stub))
    subprocess.run([linker, "-arch", "arm64", "-platform_version", "ios", "15.0", "15.0",
                    "-no_adhoc_codesign", "-o", str(executable), str(obj), *stubs], check=True)


def xcode_link(executable, player_define):
    subprocess.run(["xcrun", "--sdk", "iphoneos", "clang", "--target=" + TARGET,
                    "-isysroot", subprocess.check_output(["xcrun", "--sdk", "iphoneos", "--show-sdk-path"],
                                                         text=True).strip(),
                    "-fobjc-arc", "-fblocks", "-Os", player_define, str(SOURCE),
                    "-framework", "UIKit", "-framework", "WebKit", "-framework", "Foundation",
                    "-Wl,-no_adhoc_codesign", "-o", str(executable)], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clang", default=shutil.which("clang") or "clang")
    parser.add_argument("--linker", default=shutil.which("ld64.lld") or "ld64.lld")
    version = plistlib.loads((RESOURCES / "Info.plist").read_bytes())["CFBundleShortVersionString"]
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / f"Huangguo-{version}-unsigned.ipa")
    parser.add_argument("--player-url", required=True, help="Published HTTPS directory containing the player")
    args = parser.parse_args()
    url = urlparse(args.player_url)
    if (url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment
            or not url.path.endswith("/") or any(ord(c) <= 32 or c in {'"', chr(92)} for c in args.player_url)):
        parser.error("--player-url must be an HTTPS directory URL ending in /")
    player_define = '-DHUANGGUO_PLAYER_URL=@"' + args.player_url + '"'
    with tempfile.TemporaryDirectory(prefix="huangguo-ipa-") as directory:
        work = Path(directory)
        app = work / "Payload" / "Huangguo.app"
        app.mkdir(parents=True)
        executable = app / "Huangguo"
        if platform.system() == "Darwin":
            xcode_link(executable, player_define)
        else:
            cross_link(args.clang, args.linker, work, executable, player_define)
        executable.chmod(0o755)
        for name in ("Info.plist", "AppIcon60x60@2x.png", "AppIcon60x60@3x.png"):
            shutil.copyfile(RESOURCES / name, app / name)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.write(app.parent, app.parent.relative_to(work))
            archive.write(app, app.relative_to(work))
            for path in sorted(app.iterdir()):
                mode = 0o755 if path == executable else 0o644
                path.chmod(mode | stat.S_IWUSR)
                archive.write(path, path.relative_to(work))
        print(args.output.resolve())


if __name__ == "__main__":
    main()
