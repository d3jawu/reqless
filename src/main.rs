extern crate swc_common;
extern crate swc_ecma_parser;
extern crate swc_ecma_visit;

use std::path::Path;

use swc_common::sync::Lrc;
use swc_common::{
    errors::{ColorConfig, Handler},
    SourceMap,
};
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax};
use swc_ecma_visit::swc_ecma_ast::{CallExpr, Callee, Expr, Lit, Str};
use swc_ecma_visit::{VisitAll, VisitAllWith};

struct Visitor {}

impl VisitAll for Visitor {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        println!("Call expr");

        if let Callee::Expr(boxed) = &call.callee {
            let callee = &**boxed;

            if let Expr::Ident(ident) = callee {
                if ident.sym.to_string().eq("require") {
                    println!("It's a require!");

                    if call.args.len() == 1 {
                        if let Expr::Lit(Lit::Str(Str {
                            value: name,
                            span: _,
                            raw: _,
                        })) = &*call.args[0].expr
                        {
                            println!("Requiring {}", name)
                        }
                    }
                }
            }
        }
    }
}

fn main() {
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm
        .load_file(Path::new("scratch/main.js"))
        .expect("Couldn't open");
    let lexer = Lexer::new(
        Syntax::Es(Default::default()),
        Default::default(),
        StringInput::from(&*fm),
        None,
    );

    let mut parser = Parser::new_from(lexer);

    let handler = Handler::with_tty_emitter(ColorConfig::Auto, true, false, Some(cm.clone()));

    let module = parser
        .parse_module()
        .map_err(|mut e| e.into_diagnostic(&handler).emit())
        .expect("failed to parse module");

    let mut visitor = Visitor {};
    module.visit_all_with(&mut visitor)
}
