// Declarations for the subset of public UIKit, Foundation and WebKit APIs used by
// Player.m when cross-compiling without an Apple SDK. Xcode uses the SDK headers.
typedef _Bool BOOL;
typedef long NSInteger;
typedef unsigned long NSUInteger;
typedef double CGFloat;
typedef struct CGPoint { CGFloat x, y; } CGPoint;
typedef struct CGSize { CGFloat width, height; } CGSize;
typedef struct CGRect { CGPoint origin; CGSize size; } CGRect;
#define YES ((BOOL)1)
#define NO ((BOOL)0)
#define nil ((id)0)

enum {
    UIViewAutoresizingFlexibleWidth = 2,
    UIViewAutoresizingFlexibleHeight = 16,
    UIScrollViewContentInsetAdjustmentNever = 2,
    NSURLErrorCancelled = -999,
    UIAlertControllerStyleAlert = 1,
    UIAlertActionStyleDefault = 0,
};

typedef NSInteger UIStatusBarStyle;
enum { UIStatusBarStyleLightContent = 1 };
typedef NSInteger WKNavigationActionPolicy;
enum { WKNavigationActionPolicyCancel = 0, WKNavigationActionPolicyAllow = 1 };

__attribute__((objc_root_class))
@interface NSObject
+ (instancetype)alloc;
- (instancetype)init;
@end

@interface NSString : NSObject
- (BOOL)isEqualToString:(NSString *)value;
- (BOOL)hasPrefix:(NSString *)value;
@end
@interface NSDictionary : NSObject
+ (instancetype)dictionary;
@end
@interface NSURL : NSObject
+ (instancetype)URLWithString:(NSString *)value;
@property(nonatomic, readonly) NSString *scheme;
@property(nonatomic, readonly) NSString *host;
@property(nonatomic, readonly) NSString *path;
@end
@interface NSURLRequest : NSObject
+ (instancetype)requestWithURL:(NSURL *)url;
@property(nonatomic, readonly) NSURL *URL;
@end
@interface NSError : NSObject
@property(nonatomic, readonly) NSInteger code;
@end

@protocol UIApplicationDelegate @end
@protocol UIWindowSceneDelegate @end
@interface UIResponder : NSObject @end
@interface UIApplication : UIResponder
+ (UIApplication *)sharedApplication;
- (void)openURL:(NSURL *)url options:(NSDictionary *)options completionHandler:(void (^)(BOOL success))completion;
@end
@interface UIColor : NSObject
+ (UIColor *)blackColor;
@end
@interface UIView : UIResponder
@property(nonatomic) CGRect bounds;
@property(nonatomic) NSUInteger autoresizingMask;
@property(nonatomic, getter=isOpaque) BOOL opaque;
@property(nonatomic, strong) UIColor *backgroundColor;
- (void)addSubview:(UIView *)view;
@end
@interface UIScrollView : UIView
@property(nonatomic) NSInteger contentInsetAdjustmentBehavior;
@property(nonatomic) BOOL bounces;
@end
@interface UIViewController : UIResponder
@property(nonatomic, strong) UIView *view;
@property(nonatomic, readonly) UIViewController *presentedViewController;
- (void)viewDidLoad;
- (UIStatusBarStyle)preferredStatusBarStyle;
- (void)presentViewController:(UIViewController *)controller animated:(BOOL)animated completion:(void (^)(void))completion;
@end
@class UIScene, UISceneSession, UISceneConnectionOptions;
@interface UIWindowScene : UIResponder @end
@interface UIWindow : UIView
- (instancetype)initWithWindowScene:(UIWindowScene *)windowScene;
@property(nonatomic, strong) UIViewController *rootViewController;
- (void)makeKeyAndVisible;
@end
@interface UIAlertAction : NSObject
+ (instancetype)actionWithTitle:(NSString *)title style:(NSInteger)style handler:(void (^)(UIAlertAction *action))handler;
@end
@interface UIAlertController : UIViewController
+ (instancetype)alertControllerWithTitle:(NSString *)title message:(NSString *)message preferredStyle:(NSInteger)preferredStyle;
- (void)addAction:(UIAlertAction *)action;
@end
extern int UIApplicationMain(int argc, char **argv, NSString *principalClassName, NSString *delegateClassName);

@protocol WKNavigationDelegate @end
@protocol WKUIDelegate @end
@class WKNavigation, WKFrameInfo, WKWindowFeatures;
@interface WKNavigationAction : NSObject
@property(nonatomic, readonly) NSURLRequest *request;
@property(nonatomic, readonly) WKFrameInfo *targetFrame;
@end
@interface WKWebViewConfiguration : NSObject
@property(nonatomic) BOOL allowsInlineMediaPlayback;
@end
@interface WKWebView : UIView
- (instancetype)initWithFrame:(CGRect)frame configuration:(WKWebViewConfiguration *)configuration;
@property(nonatomic, weak) id<WKNavigationDelegate> navigationDelegate;
@property(nonatomic, weak) id<WKUIDelegate> UIDelegate;
@property(nonatomic) BOOL allowsBackForwardNavigationGestures;
@property(nonatomic, readonly) UIScrollView *scrollView;
- (WKNavigation *)loadRequest:(NSURLRequest *)request;
- (WKNavigation *)loadHTMLString:(NSString *)string baseURL:(NSURL *)baseURL;
- (WKNavigation *)reload;
@end
