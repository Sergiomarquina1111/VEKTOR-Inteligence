from .extractor import extract_triples, gemini_available
from .graph_builder import (
    load_all_dkgs,
    load_sentence_transformer,
    build_skg,
    match_skg_to_dkg,
    get_dkg_for_subject,
    get_loaded_dkg_keys,
    sentence_transformer_loaded,
    get_similarity_scores,
)
from .comparator import (
    compare_graphs,
    classify_tier,
    build_gap_list,
    build_misconception_list,
)
from .explainer import generate_explanation, build_dkg_context
