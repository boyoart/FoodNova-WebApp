import 'package:flutter/material.dart';

class FnShell extends StatelessWidget {
  const FnShell(
      {required this.child, this.title, this.actions = const [], super.key});

  final Widget child;
  final String? title;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar:
          title == null ? null : AppBar(title: Text(title!), actions: actions),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: child,
        ),
      ),
    );
  }
}
