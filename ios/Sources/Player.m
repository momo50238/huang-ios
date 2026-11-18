#if __has_include(<UIKit/UIKit.h>) && __has_include(<WebKit/WebKit.h>)
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#else
#import "Platform.h"
#endif

#ifndef HUANGGUO_PLAYER_URL
#error Define HUANGGUO_PLAYER_URL with the deployed HTTPS player address.
#endif

static NSString *const PlayerURL = HUANGGUO_PLAYER_URL;
static NSString *const StartPage =
    @"<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'>"
     "<meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>"
     "<style>"
     "*{box-sizing:border-box}body{margin:0;background:#101a14;color:#f6f7f2;font-family:-apple-system,sans-serif}"
     "main{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) 28px max(24px,env(safe-area-inset-bottom))}"
     "section{width:min(100%,360px);text-align:center}.mark{display:grid;place-items:center;margin:0 auto 18px;width:65px;height:65px;border:1px solid #7d9e66;border-radius:18px;color:#d7f87f;background:#243b27;font-size:32px}"
     "h1{margin:0;font-size:30px}p{margin:12px 0 24px;font-size:15px;line-height:1.6;color:#bfcbbd}"
     "a{display:block;margin:10px 0;padding:15px 10px;border:1px solid #405241;border-radius:13px;text-decoration:none;color:#d7f87f;font-weight:650}"
     "a:first-of-type{border-color:#d7f87f;background:#d7f87f;color:#152017}"
     "</style></head><body><main><section>"
     "<div class='mark' aria-hidden='true'>♪</div><h1>黄果播放器</h1>"
     "<p>播放器未能载入。你可以重试，或在浏览器打开。</p>"
     "<a href='huangguo-app://retry'>重试打开播放器</a>"
     "<a href='huangguo-app://browser'>在浏览器打开</a>"
     "</section></main></body></html>";

@interface PlayerController : UIViewController <WKNavigationDelegate>
@property(nonatomic, strong) WKWebView *browser;
@end

@implementation PlayerController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor blackColor];

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.allowsInlineMediaPlayback = YES;
    WKWebView *browser = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:configuration];
    browser.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    browser.navigationDelegate = self;
    browser.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    browser.scrollView.bounces = NO;
    browser.opaque = NO;
    browser.backgroundColor = [UIColor blackColor];

    self.browser = browser;
    [self.view addSubview:browser];
    [self openPlayer];
}

- (UIStatusBarStyle)preferredStatusBarStyle {
    return UIStatusBarStyleLightContent;
}

- (void)webView:(WKWebView *)webView
        decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
        decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    if ([url.scheme isEqualToString:@"about"]) {
        decisionHandler(WKNavigationActionPolicyAllow);
        return;
    }

    NSURL *page = [NSURL URLWithString:PlayerURL];
    if ([url.scheme isEqualToString:@"https"] && [url.host isEqualToString:page.host] &&
        [url.path hasPrefix:page.path]) {
        decisionHandler(WKNavigationActionPolicyAllow);
        return;
    }

    BOOL isStartPageAction = [url.scheme isEqualToString:@"huangguo-app"];
    decisionHandler(WKNavigationActionPolicyCancel);
    if (!isStartPageAction) return;
    if ([url.host isEqualToString:@"browser"]) [self openInBrowser];
    if ([url.host isEqualToString:@"retry"]) [self openPlayer];
}

- (void)openPlayer {
    [self.browser loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:PlayerURL]]];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation
        withError:(NSError *)error {
    if (error.code != NSURLErrorCancelled) [webView loadHTMLString:StartPage baseURL:nil];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation
        withError:(NSError *)error {
    if (error.code != NSURLErrorCancelled) [webView loadHTMLString:StartPage baseURL:nil];
}

- (void)openInBrowser {
    NSURL *url = [NSURL URLWithString:PlayerURL];
    __weak PlayerController *weakSelf = self;
    [[UIApplication sharedApplication] openURL:url options:[NSDictionary dictionary]
        completionHandler:^(BOOL opened) {
            if (!opened) [weakSelf showBrowserFailure];
        }];
}

- (void)showBrowserFailure {
    if (self.presentedViewController != nil) return;
    UIAlertController *alert = [UIAlertController
        alertControllerWithTitle:@"无法打开浏览器"
        message:@"请在 Safari 中打开黄果播放器。"
        preferredStyle:UIAlertControllerStyleAlert];
    [alert addAction:[UIAlertAction actionWithTitle:@"好" style:UIAlertActionStyleDefault handler:nil]];
    [self presentViewController:alert animated:YES completion:nil];
}

- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {
    [webView loadHTMLString:StartPage baseURL:nil];
}

@end

@interface PlayerAppDelegate : UIResponder <UIApplicationDelegate>
@end

@implementation PlayerAppDelegate
@end

@interface PlayerSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation PlayerSceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session
        options:(UISceneConnectionOptions *)connectionOptions {
    UIWindowScene *windowScene = (UIWindowScene *)scene;
    self.window = [[UIWindow alloc] initWithWindowScene:windowScene];
    self.window.rootViewController = [[PlayerController alloc] init];
    [self.window makeKeyAndVisible];
}
@end

int main(int argc, char **argv) {
    @autoreleasepool {
        return UIApplicationMain(argc, argv, nil, @"PlayerAppDelegate");
    }
}
