import SwiftUI

struct CapsuleGlass: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.glassEffect(.regular, in: Capsule())
        } else {
            content.background(.regularMaterial, in: Capsule())
        }
    }
}

struct ManuscriptSearch: View {
    let notes: [Manuscript]
    let loading: Bool
    let select: (Manuscript) -> Void

    private enum Scope: String, CaseIterable { case all = "全部", title = "标题", body = "正文" }
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool
    @State private var query = ""
    @State private var scope = Scope.all
    private var term: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    if term.isEmpty {
                        placeholder("搜索文稿标题和正文")
                    } else {
                        HStack(spacing: 4) {
                            ForEach(Scope.allCases, id: \.self) { item in
                                Button(item.rawValue) { scope = item }
                                    .font(.subheadline.weight(.medium))
                                    .padding(.horizontal, 16).frame(minHeight: 44)
                                    .background(scope == item ? Color.primary.opacity(0.065) : .clear, in: Capsule())
                                    .foregroundStyle(scope == item ? .primary : .secondary)
                                    .accessibilityAddTraits(scope == item ? .isSelected : [])
                            }
                            Spacer()
                        }.buttonStyle(.plain).padding(.horizontal, 12).padding(.top, 12)
                        let matches = notes.filter {
                            (scope != .body && $0.title.localizedStandardContains(term)) ||
                            (scope != .title && $0.body.localizedStandardContains(term))
                        }
                        if matches.isEmpty && !loading {
                            placeholder("没有匹配的文稿")
                        } else {
                            ScrollView {
                                LazyVStack(alignment: .leading, spacing: 0) {
                                    ForEach(matches) { note in
                                        Button { select(note) } label: {
                                            HStack(spacing: 14) {
                                                Image(systemName: "doc.text").frame(width: 36, height: 36)
                                                    .overlay { RoundedRectangle(cornerRadius: 9).stroke(.quaternary) }
                                                VStack(alignment: .leading, spacing: 3) {
                                                    Text(highlighting(note.title)).lineLimit(1)
                                                    if !note.body.isEmpty {
                                                        Text(highlighting(excerpt(note.body))).font(.subheadline)
                                                            .foregroundStyle(.secondary).lineLimit(1)
                                                    }
                                                }
                                                Spacer(minLength: 0)
                                            }.padding(.horizontal, 16).frame(minHeight: 66).contentShape(Rectangle())
                                        }.buttonStyle(.plain).accessibilityIdentifier("searchResult")
                                    }
                                    if loading { ProgressView().frame(maxWidth: .infinity).padding() }
                                }
                            }.scrollDismissesKeyboard(.interactively)
                        }
                    }
                }.padding(.trailing, geo.safeAreaInsets.trailing)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                HStack(spacing: 12) {
                    HStack(spacing: 9) {
                        Image(systemName: "magnifyingglass")
                        TextField("搜索文稿", text: $query).focused($focused)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .submitLabel(.search).onSubmit { focused = false }
                            .accessibilityIdentifier("searchField")
                        if !query.isEmpty {
                            Button { query = ""; focused = true } label: {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                            }.accessibilityLabel("清空搜索")
                        }
                    }.padding(.horizontal, 16).frame(height: 48).modifier(CapsuleGlass())
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.title3).frame(width: 48, height: 48)
                    }.modifier(CapsuleGlass()).accessibilityLabel("关闭搜索")
                }.buttonStyle(.plain).padding(.leading, 12).padding(.trailing, geo.safeAreaInsets.trailing >= 60 ? 24 : 12)
                    .padding(.vertical, 10)
            }.ignoresSafeArea(.container, edges: .trailing)
        }
        .background(Color(uiColor: .systemBackground))
        .onAppear { focused = true }
    }

    private func placeholder(_ label: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "magnifyingglass").font(.title).foregroundStyle(.secondary)
            Text(label).font(.body)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func excerpt(_ body: String) -> String {
        let hit = body.localizedStandardRange(of: term)?.lowerBound ?? body.startIndex
        let start = body.index(hit, offsetBy: -12, limitedBy: body.startIndex) ?? body.startIndex
        let snippet = body[start...].prefix(110).split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return (start == body.startIndex ? "" : "…") + snippet
    }

    private func highlighting(_ value: String) -> AttributedString {
        var text = AttributedString(value)
        if let range = value.localizedStandardRange(of: term), let match = Range(range, in: text) {
            text[match].inlinePresentationIntent = .stronglyEmphasized
        }
        return text
    }
}
